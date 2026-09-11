CREATE OR REPLACE FUNCTION public.create_inspection_from_event(p_event_id uuid)
 RETURNS TABLE(inspection_id uuid, failure_reason text, error_detail text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_event RECORD;
  v_payload jsonb;
  v_structure jsonb;
  v_inspection_id uuid;
  v_inspector_id uuid;
  v_executive_id uuid;
  v_type text;
  v_status text;
  v_started timestamptz := clock_timestamp();
  v_step text := 'load_event';
BEGIN
  SELECT * INTO v_event FROM public.inspection_source_events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::uuid, 'unknown'::text, ('event_not_found:' || p_event_id::text);
    RETURN;
  END IF;

  v_payload := COALESCE(v_event.normalized_payload_json, v_event.payload_json);
  v_structure := COALESCE((v_event.payload_json -> 'generated_structure_json'), v_event.normalized_payload_json -> '__generated__');

  v_step := 'structure_validation';
  UPDATE public.inspection_source_events SET processing_step = v_step WHERE id = p_event_id;

  IF v_structure IS NULL OR jsonb_typeof(v_structure -> 'sections') <> 'array'
     OR jsonb_array_length(v_structure -> 'sections') = 0 THEN
    UPDATE public.inspection_source_events
    SET processing_status = 'failed',
        failure_reason = 'structure_generation',
        error_message = 'missing_or_empty_generated_structure',
        processed_at = now(),
        processing_duration_ms = EXTRACT(MILLISECONDS FROM (clock_timestamp() - v_started))::int
    WHERE id = p_event_id;
    RETURN QUERY SELECT NULL::uuid, 'structure_generation'::text, 'missing_or_empty_generated_structure'::text;
    RETURN;
  END IF;

  v_inspector_id := NULLIF(v_payload #>> '{inspector,id}', '')::uuid;
  v_executive_id := NULLIF(v_payload #>> '{executive,id}', '')::uuid;
  v_type := v_payload ->> 'inspection_type';

  -- Check-in inspections have no executive by design: an assigned Property
  -- Advisor is enough to consider them assigned.
  v_status := CASE
    WHEN v_inspector_id IS NOT NULL AND (v_executive_id IS NOT NULL OR v_type = 'check_in') THEN 'assigned'
    ELSE 'pending_assignment'
  END;

  -- Stage 1: insert inspection
  v_step := 'inspection_insert';
  UPDATE public.inspection_source_events SET processing_step = v_step WHERE id = p_event_id;
  BEGIN
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
      v_type,
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
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.inspection_source_events
    SET processing_status = 'failed', failure_reason = 'inspection_insert',
        error_message = SQLERRM, processed_at = now(),
        processing_duration_ms = EXTRACT(MILLISECONDS FROM (clock_timestamp() - v_started))::int
    WHERE id = p_event_id;
    RETURN QUERY SELECT NULL::uuid, 'inspection_insert'::text, SQLERRM;
    RETURN;
  END;

  -- Stage 2: bulk insert sections
  v_step := 'sections_insert';
  UPDATE public.inspection_source_events SET processing_step = v_step WHERE id = p_event_id;
  BEGIN
    CREATE TEMP TABLE _ins_sections ON COMMIT DROP AS
    WITH ins AS (
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
    )
    SELECT id, section_key FROM ins;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.inspection_source_events
    SET processing_status = 'failed', failure_reason = 'sections_insert',
        error_message = SQLERRM, processed_at = now(),
        processing_duration_ms = EXTRACT(MILLISECONDS FROM (clock_timestamp() - v_started))::int
    WHERE id = p_event_id;
    RETURN QUERY SELECT NULL::uuid, 'sections_insert'::text, SQLERRM;
    RETURN;
  END;

  -- Stage 3: mark event processed
  v_step := 'event_finalize';
  UPDATE public.inspection_source_events
  SET processing_status = 'processed',
      inspection_id = v_inspection_id,
      failure_reason = NULL,
      error_message = NULL,
      processed_at = now(),
      processing_step = v_step,
      processing_duration_ms = EXTRACT(MILLISECONDS FROM (clock_timestamp() - v_started))::int
  WHERE id = p_event_id;

  RETURN QUERY SELECT v_inspection_id, NULL::text, NULL::text;
END;
$function$;

-- Backfill: check-ins with an assigned advisor should not stay "sin asignar"
UPDATE public.inspections
SET status = 'assigned'
WHERE inspection_type = 'check_in'
  AND inspector_id IS NOT NULL
  AND status = 'pending_assignment';