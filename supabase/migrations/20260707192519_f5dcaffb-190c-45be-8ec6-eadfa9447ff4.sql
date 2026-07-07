
-- Patch submit_owner_feedback: advance current_stage to 'share' when owner accepts all
CREATE OR REPLACE FUNCTION public.submit_owner_feedback(p_property_id text, p_token text, p_submitter_name text, p_decisions jsonb)
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

  SELECT array_agg((rep->>'id')::uuid)
    INTO v_expected_ids
  FROM jsonb_array_elements(v_payload->'sections') AS s
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s->'repairs', '[]'::jsonb)) AS rep
  WHERE rep ? 'id' AND (rep->>'id') IS NOT NULL;
  v_expected_ids := COALESCE(v_expected_ids, ARRAY[]::uuid[]);

  SELECT array_agg((d->>'repair_item_id')::uuid) INTO v_provided_ids
  FROM jsonb_array_elements(p_decisions) AS d;
  v_provided_ids := COALESCE(v_provided_ids, ARRAY[]::uuid[]);

  IF (SELECT count(*) FROM unnest(v_expected_ids) e WHERE NOT (e = ANY (v_provided_ids))) > 0 THEN
    RAISE EXCEPTION 'missing_decisions_for_some_repairs';
  END IF;

  DELETE FROM inspection_owner_feedback WHERE report_version_id = v_version_id;

  FOR v_decision IN SELECT * FROM jsonb_array_elements(p_decisions) LOOP
    v_repair_id := (v_decision->>'repair_item_id')::uuid;
    v_decision_value := v_decision->>'decision';
    v_comment := NULLIF(trim(coalesce(v_decision->>'comment','')), '');
    IF v_decision_value NOT IN ('accepted','rejected','observed') THEN
      RAISE EXCEPTION 'invalid_decision_value:%', v_decision_value;
    END IF;
    IF NOT (v_repair_id = ANY (v_expected_ids)) THEN CONTINUE; END IF;
    INSERT INTO inspection_owner_feedback (
      inspection_id, report_version_id, repair_item_id, decision, comment, submitter_name
    ) VALUES (
      v_inspection_id, v_version_id, v_repair_id, v_decision_value, v_comment,
      NULLIF(trim(coalesce(p_submitter_name,'')), '')
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
    'accepted', v_count_accepted, 'rejected', v_count_rejected,
    'observed', v_count_observed, 'total', COALESCE(array_length(v_expected_ids, 1), 0),
    'all_accepted', v_all_accepted
  );

  INSERT INTO inspection_owner_feedback_submissions (
    inspection_id, report_version_id, submitter_name, summary_json, all_accepted
  ) VALUES (
    v_inspection_id, v_version_id,
    NULLIF(trim(coalesce(p_submitter_name,'')), ''), v_summary, v_all_accepted
  );

  UPDATE inspection_report_versions SET owner_decision_summary_json = v_summary WHERE id = v_version_id;

  UPDATE inspections
     SET owner_feedback_status = CASE WHEN v_all_accepted THEN 'accepted' ELSE 'pending_executive_review' END,
         owner_feedback_last_submitted_at = now(),
         status = CASE WHEN v_all_accepted THEN 'approved' ELSE status END,
         current_stage = CASE WHEN v_all_accepted THEN 'share' ELSE current_stage END
   WHERE id = v_inspection_id;

  RETURN v_summary;
END;
$function$;

-- Patch executive_force_close_owner_feedback: also advance current_stage to 'share'
CREATE OR REPLACE FUNCTION public.executive_force_close_owner_feedback(p_inspection_id uuid, p_reason text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_authorized boolean;
  v_inspection RECORD;
  v_version_id uuid;
  v_executive_name text;
  v_summary jsonb;
  v_old_status text;
  v_old_feedback_status text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  v_is_authorized := public.has_role(v_uid, 'executive') OR public.has_role(v_uid, 'admin');
  IF NOT v_is_authorized THEN RAISE EXCEPTION 'insufficient_privileges'; END IF;
  IF p_reason NOT IN ('no_response', 'coordinated_offline', 'other') THEN
    RAISE EXCEPTION 'invalid_reason:%', p_reason;
  END IF;
  IF p_reason = 'other' AND (p_note IS NULL OR length(trim(p_note)) = 0) THEN
    RAISE EXCEPTION 'note_required_for_other';
  END IF;

  SELECT id, status, owner_feedback_status INTO v_inspection FROM inspections WHERE id = p_inspection_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'inspection_not_found'; END IF;
  v_old_status := v_inspection.status;
  v_old_feedback_status := v_inspection.owner_feedback_status;
  IF v_inspection.status NOT IN ('published', 'sent') THEN
    RAISE EXCEPTION 'inspection_not_published:%', v_inspection.status;
  END IF;
  IF v_inspection.owner_feedback_status = 'accepted' THEN
    RETURN jsonb_build_object('status', 'noop', 'reason', 'already_closed');
  END IF;

  SELECT id INTO v_version_id
  FROM inspection_report_versions
  WHERE inspection_id = p_inspection_id AND audience = 'owner'
    AND is_latest = true AND status = 'published' LIMIT 1;

  SELECT COALESCE(full_name, email, 'Ejecutivo') INTO v_executive_name FROM profiles WHERE id = v_uid;

  v_summary := jsonb_build_object(
    'manual_closure', true, 'reason', p_reason,
    'note', NULLIF(trim(coalesce(p_note,'')), ''),
    'closed_by_id', v_uid, 'closed_by_name', v_executive_name, 'closed_at', now()
  );

  IF v_version_id IS NOT NULL THEN
    INSERT INTO inspection_owner_feedback_submissions (
      inspection_id, report_version_id, submitter_name, summary_json, all_accepted
    ) VALUES (
      p_inspection_id, v_version_id,
      'Cierre manual — ' || v_executive_name, v_summary, true
    );
  END IF;

  UPDATE inspections
     SET owner_feedback_status = 'accepted',
         owner_feedback_last_submitted_at = COALESCE(owner_feedback_last_submitted_at, now()),
         status = 'approved',
         current_stage = 'share',
         approved_at = now(),
         approved_by = v_uid
   WHERE id = p_inspection_id;

  INSERT INTO inspection_audit_log (inspection_id, actor_id, action, payload)
  VALUES (
    p_inspection_id, v_uid, 'owner_feedback_manual_closure',
    jsonb_build_object(
      'reason', p_reason, 'note', NULLIF(trim(coalesce(p_note,'')), ''),
      'old_status', v_old_status, 'new_status', 'approved',
      'old_owner_feedback_status', v_old_feedback_status,
      'new_owner_feedback_status', 'accepted'
    )
  );

  RETURN jsonb_build_object('status', 'closed', 'reason', p_reason,
    'inspection_id', p_inspection_id, 'summary', v_summary);
END;
$function$;

-- Backfill any remaining approved-but-stuck inspections
UPDATE public.inspections
   SET current_stage = 'share'
 WHERE status = 'approved'
   AND current_stage <> 'share'
   AND published_at IS NULL;
