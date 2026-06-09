CREATE OR REPLACE FUNCTION public.executive_force_close_owner_feedback(
  p_inspection_id uuid,
  p_reason text,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  v_is_authorized := public.has_role(v_uid, 'executive') OR public.has_role(v_uid, 'admin');
  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'insufficient_privileges';
  END IF;

  IF p_reason NOT IN ('no_response', 'coordinated_offline', 'other') THEN
    RAISE EXCEPTION 'invalid_reason:%', p_reason;
  END IF;

  IF p_reason = 'other' AND (p_note IS NULL OR length(trim(p_note)) = 0) THEN
    RAISE EXCEPTION 'note_required_for_other';
  END IF;

  SELECT id, status, owner_feedback_status
    INTO v_inspection
  FROM inspections
  WHERE id = p_inspection_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'inspection_not_found';
  END IF;

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
  WHERE inspection_id = p_inspection_id
    AND audience = 'owner'
    AND is_latest = true
    AND status = 'published'
  LIMIT 1;

  SELECT COALESCE(full_name, email, 'Ejecutivo')
    INTO v_executive_name
  FROM profiles
  WHERE id = v_uid;

  v_summary := jsonb_build_object(
    'manual_closure', true,
    'reason', p_reason,
    'note', NULLIF(trim(coalesce(p_note,'')), ''),
    'closed_by_id', v_uid,
    'closed_by_name', v_executive_name,
    'closed_at', now()
  );

  IF v_version_id IS NOT NULL THEN
    INSERT INTO inspection_owner_feedback_submissions (
      inspection_id, report_version_id, submitter_name, summary_json, all_accepted
    ) VALUES (
      p_inspection_id, v_version_id,
      'Cierre manual — ' || v_executive_name,
      v_summary, true
    );
  END IF;

  UPDATE inspections
     SET owner_feedback_status = 'accepted',
         owner_feedback_last_submitted_at = COALESCE(owner_feedback_last_submitted_at, now()),
         status = 'approved',
         approved_at = now(),
         approved_by = v_uid
   WHERE id = p_inspection_id;

  INSERT INTO inspection_audit_log (inspection_id, actor_id, action, payload)
  VALUES (
    p_inspection_id, v_uid, 'owner_feedback_manual_closure',
    jsonb_build_object(
      'reason', p_reason,
      'note', NULLIF(trim(coalesce(p_note,'')), ''),
      'old_status', v_old_status,
      'new_status', 'approved',
      'old_owner_feedback_status', v_old_feedback_status,
      'new_owner_feedback_status', 'accepted'
    )
  );

  RETURN jsonb_build_object(
    'status', 'closed',
    'reason', p_reason,
    'inspection_id', p_inspection_id,
    'summary', v_summary
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.executive_force_close_owner_feedback(uuid, text, text) TO authenticated;