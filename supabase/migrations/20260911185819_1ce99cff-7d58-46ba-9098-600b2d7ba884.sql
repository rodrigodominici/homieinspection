-- 1) Check-in nunca lleva ejecutivo
CREATE OR REPLACE FUNCTION public.enforce_checkin_no_executive()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.inspection_type = 'check_in' THEN
    NEW.executive_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_checkin_no_executive ON public.inspections;
CREATE TRIGGER trg_checkin_no_executive
BEFORE INSERT OR UPDATE ON public.inspections
FOR EACH ROW EXECUTE FUNCTION public.enforce_checkin_no_executive();

UPDATE public.inspections
   SET executive_id = NULL
 WHERE inspection_type = 'check_in' AND executive_id IS NOT NULL;

-- 2) Check-in se finaliza directo tras la inspección
CREATE OR REPLACE FUNCTION public.finalize_inspection(p_inspection_id uuid, p_note text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  IF v_insp.inspection_type = 'check_in' THEN
    -- Check-in: inspección → finalizado, sin revisión ni cotización.
    IF v_insp.status NOT IN ('submitted', 'in_review', 'approved', 'accepted', 'published') THEN
      RAISE EXCEPTION 'invalid_status';
    END IF;
  ELSE
    IF NOT (
      v_insp.status IN ('approved', 'accepted')
      OR (v_insp.status = 'published' AND v_insp.owner_feedback_status = 'accepted')
    ) THEN
      RAISE EXCEPTION 'invalid_status';
    END IF;

    IF v_insp.quien_repara IS NULL THEN
      RAISE EXCEPTION 'quien_repara_required';
    END IF;

    IF v_insp.quien_repara = 'homie' AND v_insp.work_status <> 'done' THEN
      RAISE EXCEPTION 'work_not_done';
    END IF;
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
$function$;