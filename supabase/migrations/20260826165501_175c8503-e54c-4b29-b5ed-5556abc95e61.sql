CREATE OR REPLACE FUNCTION public.finalize_inspection(p_inspection_id uuid, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_insp record;
BEGIN
  v_role := public.get_user_role(auth.uid());
  IF v_role IS NULL OR v_role NOT IN ('admin', 'executive') THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO v_insp FROM public.inspections WHERE id = p_inspection_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'inspection_not_found';
  END IF;

  IF v_role = 'executive'
     AND v_insp.executive_id IS NOT NULL
     AND v_insp.executive_id <> auth.uid() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF v_insp.status = 'sent' THEN
    RETURN jsonb_build_object('status', 'noop');
  END IF;

  IF v_insp.status NOT IN ('approved', 'accepted') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;

  IF v_insp.quien_repara IS NULL THEN
    RAISE EXCEPTION 'quien_repara_required';
  END IF;

  UPDATE public.inspections
     SET status = 'sent',
         current_stage = 'share',
         updated_at = now()
   WHERE id = p_inspection_id;

  INSERT INTO public.inspection_audit_log (inspection_id, previous_status, new_status, action, performed_by, note)
  VALUES (p_inspection_id, v_insp.status, 'sent', 'finalize_inspection', auth.uid(), p_note);

  RETURN jsonb_build_object('status', 'finalized');
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_inspection(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_inspection(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.finalize_inspection(uuid, text) TO authenticated;