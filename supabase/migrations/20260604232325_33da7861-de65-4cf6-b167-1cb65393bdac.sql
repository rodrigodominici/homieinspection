
-- 1. Extend inspections
ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS owner_feedback_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS owner_feedback_last_submitted_at timestamptz;

-- 2. Extend report versions with cached summary
ALTER TABLE public.inspection_report_versions
  ADD COLUMN IF NOT EXISTS owner_decision_summary_json jsonb;

-- 3. Per-repair decisions
CREATE TABLE IF NOT EXISTS public.inspection_owner_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL,
  report_version_id uuid NOT NULL,
  repair_item_id uuid NOT NULL,
  decision text NOT NULL CHECK (decision IN ('accepted','rejected','observed')),
  comment text,
  submitter_name text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_version_id, repair_item_id)
);

GRANT SELECT ON public.inspection_owner_feedback TO authenticated;
GRANT ALL ON public.inspection_owner_feedback TO service_role;
ALTER TABLE public.inspection_owner_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage owner feedback"
  ON public.inspection_owner_feedback FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Executives view owner feedback of assigned inspections"
  ON public.inspection_owner_feedback FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.inspections i
    WHERE i.id = inspection_owner_feedback.inspection_id
      AND i.executive_id = auth.uid()
  ));

CREATE INDEX IF NOT EXISTS idx_owner_feedback_version
  ON public.inspection_owner_feedback (report_version_id);
CREATE INDEX IF NOT EXISTS idx_owner_feedback_inspection
  ON public.inspection_owner_feedback (inspection_id);

-- 4. Submission audit
CREATE TABLE IF NOT EXISTS public.inspection_owner_feedback_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL,
  report_version_id uuid NOT NULL,
  submitter_name text,
  summary_json jsonb NOT NULL,
  all_accepted boolean NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.inspection_owner_feedback_submissions TO authenticated;
GRANT ALL ON public.inspection_owner_feedback_submissions TO service_role;
ALTER TABLE public.inspection_owner_feedback_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage owner feedback submissions"
  ON public.inspection_owner_feedback_submissions FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Executives view feedback submissions of assigned inspections"
  ON public.inspection_owner_feedback_submissions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.inspections i
    WHERE i.id = inspection_owner_feedback_submissions.inspection_id
      AND i.executive_id = auth.uid()
  ));

CREATE INDEX IF NOT EXISTS idx_owner_feedback_subs_inspection
  ON public.inspection_owner_feedback_submissions (inspection_id);

-- 5. Rewrite get_published_report to include repair ids + lock state + decisions
CREATE OR REPLACE FUNCTION public.get_published_report(p_property_id text, p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  v_inspection_id uuid;
  v_version_id uuid;
  v_audience text;
  v_fecha_recoleccion_llaves text;
  v_locked boolean := false;
  v_decisions jsonb := '[]'::jsonb;
  v_inspection_status text;
  v_owner_feedback_status text;
BEGIN
  SELECT irv.normalized_payload, irv.inspection_id, irv.audience, irv.id
    INTO result, v_inspection_id, v_audience, v_version_id
  FROM inspection_report_versions irv
  JOIN inspections i ON i.id = irv.inspection_id
  WHERE irv.public_token = p_token
    AND i.property_id = p_property_id
    AND irv.status = 'published'
    AND irv.is_latest = true;

  IF result IS NULL THEN
    RETURN NULL;
  END IF;

  IF result ? 'fecha_recoleccion_llaves' AND (result->>'fecha_recoleccion_llaves') IS NOT NULL THEN
    v_fecha_recoleccion_llaves := result->>'fecha_recoleccion_llaves';
  ELSE
    SELECT COALESCE(
      i.property_overrides_json->>'fecha_recoleccion_llaves',
      i.property_snapshot_json->>'fecha_recoleccion_llaves'
    )
      INTO v_fecha_recoleccion_llaves
    FROM inspections i
    WHERE i.id = v_inspection_id;
  END IF;

  SELECT i.status, i.owner_feedback_status
    INTO v_inspection_status, v_owner_feedback_status
  FROM inspections i WHERE i.id = v_inspection_id;

  -- Locked if any feedback exists for this version
  SELECT EXISTS (
    SELECT 1 FROM inspection_owner_feedback f
    WHERE f.report_version_id = v_version_id
  ) INTO v_locked;

  IF v_locked THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'repair_item_id', f.repair_item_id,
      'decision', f.decision,
      'comment', f.comment
    )), '[]'::jsonb)
    INTO v_decisions
    FROM inspection_owner_feedback f
    WHERE f.report_version_id = v_version_id;
  END IF;

  RETURN result
    || jsonb_build_object('audience', COALESCE(v_audience, 'owner'))
    || jsonb_build_object('fecha_recoleccion_llaves', v_fecha_recoleccion_llaves)
    || jsonb_build_object('version_id', v_version_id)
    || jsonb_build_object('owner_feedback_locked', v_locked)
    || jsonb_build_object('owner_decisions', v_decisions)
    || jsonb_build_object('inspection_status', v_inspection_status)
    || jsonb_build_object('owner_feedback_status', COALESCE(v_owner_feedback_status, 'none'));
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_published_report(text, text) TO anon, authenticated;

-- 6. submit_owner_feedback: SECURITY DEFINER, callable by anon
CREATE OR REPLACE FUNCTION public.submit_owner_feedback(
  p_property_id text,
  p_token text,
  p_submitter_name text,
  p_decisions jsonb
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inspection_id uuid;
  v_version_id uuid;
  v_audience text;
  v_payload jsonb;
  v_expected_ids uuid[];
  v_provided_ids uuid[];
  v_decision jsonb;
  v_decision_value text;
  v_repair_id uuid;
  v_comment text;
  v_count_accepted int := 0;
  v_count_rejected int := 0;
  v_count_observed int := 0;
  v_all_accepted boolean;
  v_summary jsonb;
BEGIN
  -- Resolve version (must be latest published + owner audience for this property/token)
  SELECT irv.id, irv.inspection_id, irv.audience, irv.normalized_payload
    INTO v_version_id, v_inspection_id, v_audience, v_payload
  FROM inspection_report_versions irv
  JOIN inspections i ON i.id = irv.inspection_id
  WHERE irv.public_token = p_token
    AND i.property_id = p_property_id
    AND irv.status = 'published'
    AND irv.is_latest = true;

  IF v_version_id IS NULL THEN
    RAISE EXCEPTION 'invalid_or_expired_token';
  END IF;

  IF v_audience <> 'owner' THEN
    RAISE EXCEPTION 'audience_not_supported';
  END IF;

  IF jsonb_typeof(p_decisions) <> 'array' THEN
    RAISE EXCEPTION 'decisions_must_be_array';
  END IF;

  -- Collect expected repair ids from payload
  SELECT array_agg((rep->>'id')::uuid)
    INTO v_expected_ids
  FROM jsonb_array_elements(v_payload->'sections') AS s
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s->'repairs', '[]'::jsonb)) AS rep
  WHERE rep ? 'id' AND (rep->>'id') IS NOT NULL;

  v_expected_ids := COALESCE(v_expected_ids, ARRAY[]::uuid[]);

  -- Collect provided ids
  SELECT array_agg((d->>'repair_item_id')::uuid)
    INTO v_provided_ids
  FROM jsonb_array_elements(p_decisions) AS d;

  v_provided_ids := COALESCE(v_provided_ids, ARRAY[]::uuid[]);

  -- Must cover every expected id exactly
  IF (
    SELECT count(*) FROM unnest(v_expected_ids) e
    WHERE NOT (e = ANY (v_provided_ids))
  ) > 0 THEN
    RAISE EXCEPTION 'missing_decisions_for_some_repairs';
  END IF;

  -- Reset prior decisions for this version (idempotent re-submit)
  DELETE FROM inspection_owner_feedback WHERE report_version_id = v_version_id;

  -- Insert each
  FOR v_decision IN SELECT * FROM jsonb_array_elements(p_decisions) LOOP
    v_repair_id := (v_decision->>'repair_item_id')::uuid;
    v_decision_value := v_decision->>'decision';
    v_comment := NULLIF(trim(coalesce(v_decision->>'comment','')), '');

    IF v_decision_value NOT IN ('accepted','rejected','observed') THEN
      RAISE EXCEPTION 'invalid_decision_value:%', v_decision_value;
    END IF;

    IF v_decision_value IN ('rejected','observed') AND v_comment IS NULL THEN
      RAISE EXCEPTION 'comment_required_for_%', v_decision_value;
    END IF;

    -- Only accept decisions for expected ids
    IF NOT (v_repair_id = ANY (v_expected_ids)) THEN
      CONTINUE;
    END IF;

    INSERT INTO inspection_owner_feedback (
      inspection_id, report_version_id, repair_item_id,
      decision, comment, submitter_name
    ) VALUES (
      v_inspection_id, v_version_id, v_repair_id,
      v_decision_value, v_comment, NULLIF(trim(coalesce(p_submitter_name,'')), '')
    );

    IF v_decision_value = 'accepted' THEN v_count_accepted := v_count_accepted + 1;
    ELSIF v_decision_value = 'rejected' THEN v_count_rejected := v_count_rejected + 1;
    ELSE v_count_observed := v_count_observed + 1;
    END IF;
  END LOOP;

  v_all_accepted := (array_length(v_expected_ids, 1) IS NOT NULL
                     AND v_count_rejected = 0
                     AND v_count_observed = 0
                     AND v_count_accepted = array_length(v_expected_ids, 1));

  v_summary := jsonb_build_object(
    'accepted', v_count_accepted,
    'rejected', v_count_rejected,
    'observed', v_count_observed,
    'total', COALESCE(array_length(v_expected_ids, 1), 0),
    'all_accepted', v_all_accepted
  );

  INSERT INTO inspection_owner_feedback_submissions (
    inspection_id, report_version_id, submitter_name, summary_json, all_accepted
  ) VALUES (
    v_inspection_id, v_version_id,
    NULLIF(trim(coalesce(p_submitter_name,'')), ''),
    v_summary, v_all_accepted
  );

  UPDATE inspection_report_versions
     SET owner_decision_summary_json = v_summary
   WHERE id = v_version_id;

  UPDATE inspections
     SET owner_feedback_status = CASE WHEN v_all_accepted THEN 'accepted' ELSE 'pending_executive_review' END,
         owner_feedback_last_submitted_at = now(),
         status = CASE WHEN v_all_accepted THEN 'accepted' ELSE status END
   WHERE id = v_inspection_id;

  RETURN v_summary;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.submit_owner_feedback(text, text, text, jsonb) TO anon, authenticated;
