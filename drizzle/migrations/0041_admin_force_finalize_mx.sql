DROP FUNCTION IF EXISTS public.finalize_inspection(uuid, text);
CREATE OR REPLACE FUNCTION public.finalize_inspection(p_inspection_id uuid, p_note text DEFAULT NULL, p_force boolean DEFAULT false)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_role text; v_insp record; v_mx_capt boolean; v_forced boolean := false;
BEGIN
  v_role := public.get_user_role(auth.uid());
  SELECT * INTO v_insp FROM public.inspections WHERE id = p_inspection_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'inspection_not_found'; END IF;
  IF v_role = 'admin' THEN NULL;
  ELSIF v_role = 'executive' THEN
    IF v_insp.executive_id IS NOT NULL AND v_insp.executive_id <> auth.uid() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  ELSIF v_role = 'property_advisor' THEN
    IF v_insp.inspection_type <> 'check_in' OR v_insp.inspector_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  ELSE RAISE EXCEPTION 'not_authorized';
  END IF;
  IF v_insp.status = 'sent' THEN RETURN jsonb_build_object('status', 'noop'); END IF;
  IF v_insp.inspection_type = 'check_in' THEN
    IF v_insp.status NOT IN ('submitted','in_review','approved','accepted','published') THEN RAISE EXCEPTION 'invalid_status'; END IF;
  ELSE
    IF NOT (v_insp.status IN ('approved','accepted') OR (v_insp.status = 'published' AND v_insp.owner_feedback_status = 'accepted')) THEN
      RAISE EXCEPTION 'invalid_status';
    END IF;
    IF v_insp.quien_repara IS NULL THEN RAISE EXCEPTION 'quien_repara_required'; END IF;
    v_mx_capt := v_insp.inspection_type = 'captacion' AND upper(coalesce(v_insp.market,'')) LIKE 'MX%';
    IF v_insp.quien_repara = 'homie' AND v_insp.work_status <> 'done'
       AND NOT (v_mx_capt AND v_insp.work_status = 'not_applicable') THEN
      IF p_force AND v_role = 'admin' AND upper(coalesce(v_insp.market,'')) LIKE 'MX%' THEN
        IF coalesce(btrim(p_note),'') = '' THEN RAISE EXCEPTION 'force_note_required'; END IF;
        v_forced := true;
      ELSE
        RAISE EXCEPTION 'work_not_done';
      END IF;
    END IF;
  END IF;
  UPDATE public.inspections SET status = 'sent', current_stage = 'share', updated_at = now() WHERE id = p_inspection_id;
  INSERT INTO public.inspection_audit_log (inspection_id, previous_status, new_status, action, performed_by, note)
  VALUES (p_inspection_id, v_insp.status, 'sent', CASE WHEN v_forced THEN 'force_finalize_inspection' ELSE 'finalize_inspection' END, auth.uid(), p_note);
  RETURN jsonb_build_object('status', 'finalized', 'forced', v_forced);
END;
$function$;
GRANT EXECUTE ON FUNCTION public.finalize_inspection(uuid, text, boolean) TO authenticated;