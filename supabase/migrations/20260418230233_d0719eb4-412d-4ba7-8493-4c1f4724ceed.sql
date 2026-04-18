-- 1. Extend inspection_source_events
ALTER TABLE public.inspection_source_events
  ADD COLUMN IF NOT EXISTS external_event_id text,
  ADD COLUMN IF NOT EXISTS external_object_id text,
  ADD COLUMN IF NOT EXISTS event_type text,
  ADD COLUMN IF NOT EXISTS payload_version text,
  ADD COLUMN IF NOT EXISTS normalized_payload_json jsonb,
  ADD COLUMN IF NOT EXISTS inspection_id uuid,
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS processing_duration_ms integer,
  ADD COLUMN IF NOT EXISTS failure_reason text,
  ADD COLUMN IF NOT EXISTS duplicate_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duplicate_attempts_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retry_attempts_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS recovery_count integer NOT NULL DEFAULT 0;

-- 2. Constrain failure_reason vocabulary
DO $$ BEGIN
  ALTER TABLE public.inspection_source_events
    ADD CONSTRAINT inspection_source_events_failure_reason_check
    CHECK (failure_reason IS NULL OR failure_reason IN (
      'payload_validation','normalization','inspection_creation','assignment_resolution','unknown'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Constrain processing_status vocabulary (received|processing|completed|failed|ignored)
DO $$ BEGIN
  ALTER TABLE public.inspection_source_events
    ADD CONSTRAINT inspection_source_events_processing_status_check
    CHECK (processing_status IN ('pending','received','processing','completed','failed','ignored'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4. Idempotency: partial unique index on (source, external_event_id)
CREATE UNIQUE INDEX IF NOT EXISTS inspection_source_events_dedup_idx
  ON public.inspection_source_events (source, external_event_id)
  WHERE external_event_id IS NOT NULL;

-- 5. Helpful supporting indexes for logs UI
CREATE INDEX IF NOT EXISTS inspection_source_events_received_at_idx
  ON public.inspection_source_events (received_at DESC);
CREATE INDEX IF NOT EXISTS inspection_source_events_status_idx
  ON public.inspection_source_events (processing_status);
CREATE INDEX IF NOT EXISTS inspection_source_events_external_object_idx
  ON public.inspection_source_events (external_object_id);

-- 6. High-performance creation RPC
-- Reads the event's normalized_payload_json and generated_structure_json (pre-computed at intake)
-- and performs a SINGLE-transaction creation of inspection + sections + field values via bulk inserts.
CREATE OR REPLACE FUNCTION public.create_inspection_from_event(p_event_id uuid)
RETURNS TABLE(inspection_id uuid, failure_reason text, error_detail text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event RECORD;
  v_payload jsonb;
  v_structure jsonb;
  v_inspection_id uuid;
  v_inspector_id uuid;
  v_executive_id uuid;
  v_status text;
  v_started timestamptz := clock_timestamp();
BEGIN
  -- Load event
  SELECT * INTO v_event FROM public.inspection_source_events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::uuid, 'unknown'::text, ('event_not_found:' || p_event_id::text);
    RETURN;
  END IF;

  v_payload := COALESCE(v_event.normalized_payload_json, v_event.payload_json);
  v_structure := COALESCE((v_event.payload_json -> 'generated_structure_json'), v_event.normalized_payload_json -> '__generated__');

  -- The intake function persists the generated structure into normalized_payload_json -> '__generated__'
  -- as a sibling to the canonical data fields. Required to bulk-insert sections.
  IF v_structure IS NULL OR jsonb_typeof(v_structure -> 'sections') <> 'array' THEN
    RETURN QUERY SELECT NULL::uuid, 'normalization'::text, 'missing_generated_structure'::text;
    RETURN;
  END IF;

  -- Resolve assignment ids (already resolved client-side; just pull from payload)
  v_inspector_id := NULLIF(v_payload #>> '{inspector,id}', '')::uuid;
  v_executive_id := NULLIF(v_payload #>> '{executive,id}', '')::uuid;

  v_status := CASE
    WHEN v_inspector_id IS NOT NULL AND v_executive_id IS NOT NULL THEN 'assigned'
    ELSE 'pending_assignment'
  END;

  BEGIN
    -- 1. Insert parent inspection
    INSERT INTO public.inspections (
      source_event_id, property_id, market, property_name, address, property_type,
      inspection_type, hubspot_property_id, inspector_id, executive_id, status,
      scheduled_at, property_snapshot_json, generated_structure_json, created_by
    )
    VALUES (
      p_event_id,
      v_payload ->> 'property_id',
      v_payload ->> 'market',
      v_payload ->> 'property_name',
      v_payload ->> 'address',
      v_payload ->> 'property_type',
      v_payload ->> 'inspection_type',
      v_payload ->> 'hubspot_property_id',
      v_inspector_id,
      v_executive_id,
      v_status,
      NULLIF(v_payload ->> 'scheduled_at','')::timestamptz,
      COALESCE(v_payload -> '__snapshot__', v_payload),
      v_structure,
      NULL
    )
    RETURNING id INTO v_inspection_id;

    -- 2. Bulk-insert sections; capture mapping from section_key -> id
    WITH inserted_sections AS (
      INSERT INTO public.inspection_sections (
        inspection_id, section_key, section_title, section_type, sort_order, status
      )
      SELECT
        v_inspection_id,
        s ->> 'section_key',
        s ->> 'section_title',
        s ->> 'section_type',
        (s ->> 'sort_order')::int,
        'not_started'
      FROM jsonb_array_elements(v_structure -> 'sections') AS s
      RETURNING id, section_key
    ),
    -- 3. Bulk-insert field values, joining by section_key
    inserted_fields AS (
      INSERT INTO public.inspection_field_values (
        inspection_id, inspection_section_id, field_key, field_label, field_type,
        group_key, sort_order, is_visible, value_json
      )
      SELECT
        v_inspection_id,
        ins.id,
        f ->> 'field_key',
        f ->> 'field_label',
        f ->> 'field_type',
        f ->> 'group_key',
        COALESCE((f ->> 'sort_order')::int, 0),
        true,
        CASE WHEN f ? 'options_json' THEN jsonb_build_object('options', f -> 'options_json') ELSE NULL END
      FROM jsonb_array_elements(v_structure -> 'sections') AS s
      JOIN inserted_sections ins ON ins.section_key = (s ->> 'section_key')
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s -> 'fields', '[]'::jsonb)) AS f
      RETURNING 1
    )
    SELECT 1; -- finalize CTE

    -- 4. Mark event completed
    UPDATE public.inspection_source_events
    SET processing_status = 'completed',
        processed_at = now(),
        inspection_id = v_inspection_id,
        processing_duration_ms = EXTRACT(MILLISECONDS FROM (clock_timestamp() - v_started))::int,
        failure_reason = NULL,
        error_message = NULL
    WHERE id = p_event_id;

    RETURN QUERY SELECT v_inspection_id, NULL::text, NULL::text;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.inspection_source_events
    SET processing_status = 'failed',
        processed_at = now(),
        processing_duration_ms = EXTRACT(MILLISECONDS FROM (clock_timestamp() - v_started))::int,
        failure_reason = 'inspection_creation',
        error_message = SQLERRM
    WHERE id = p_event_id;
    RETURN QUERY SELECT NULL::uuid, 'inspection_creation'::text, SQLERRM;
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_inspection_from_event(uuid) TO service_role, authenticated;