ALTER TABLE public.inspection_work_order_items ADD COLUMN vacancy_type text CHECK (vacancy_type IN ('initial','new_tenant','cleaning'));
ALTER TABLE public.inspection_work_orders ADD COLUMN final_inspector_id uuid REFERENCES public.profiles(id);

CREATE TABLE public.work_order_final_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES public.inspection_work_orders(id) ON DELETE CASCADE,
  work_order_item_id uuid NOT NULL REFERENCES public.inspection_work_order_items(id) ON DELETE CASCADE,
  inspection_id uuid NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,
  result text NOT NULL CHECK (result IN ('complies','not_complies')),
  comment text,
  checked_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_final_checks_wo ON public.work_order_final_checks(work_order_id, created_at);
GRANT SELECT ON public.work_order_final_checks TO authenticated;
GRANT ALL ON public.work_order_final_checks TO service_role;
ALTER TABLE public.work_order_final_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff or final inspector read" ON public.work_order_final_checks FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'executive')
  OR EXISTS (SELECT 1 FROM public.inspection_work_orders w WHERE w.id = work_order_id AND w.final_inspector_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.set_work_order_final_inspector(p_work_order_id uuid, p_profile_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_insp uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'executive')) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  UPDATE public.inspection_work_orders SET final_inspector_id = p_profile_id WHERE id = p_work_order_id RETURNING inspection_id INTO v_insp;
  IF v_insp IS NULL THEN RAISE EXCEPTION 'work_order_not_found'; END IF;
  INSERT INTO public.inspection_audit_log (inspection_id, action, performed_by, note)
  VALUES (v_insp, 'final_inspector_assigned', auth.uid(), p_profile_id::text);
END $$;

CREATE OR REPLACE FUNCTION public.set_work_item_vacancy_type(p_item_id uuid, p_type text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'executive')) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  UPDATE public.inspection_work_order_items SET vacancy_type = p_type WHERE id = p_item_id;
END $$;

CREATE OR REPLACE FUNCTION public.record_final_check(p_item_id uuid, p_complies boolean, p_comment text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_item record; v_wo record;
BEGIN
  SELECT * INTO v_item FROM public.inspection_work_order_items WHERE id = p_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'item_not_found'; END IF;
  SELECT * INTO v_wo FROM public.inspection_work_orders WHERE id = v_item.work_order_id FOR UPDATE;
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'executive') OR v_wo.final_inspector_id = auth.uid()) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF v_wo.status NOT IN ('in_review','approved') THEN RAISE EXCEPTION 'invalid_status'; END IF;
  IF NOT p_complies AND (p_comment IS NULL OR length(trim(p_comment)) = 0) THEN RAISE EXCEPTION 'note_required'; END IF;
  INSERT INTO public.work_order_final_checks (work_order_id, work_order_item_id, inspection_id, result, comment, checked_by)
  VALUES (v_wo.id, p_item_id, v_wo.inspection_id, CASE WHEN p_complies THEN 'complies' ELSE 'not_complies' END, p_comment, auth.uid());
  IF NOT p_complies THEN
    UPDATE public.inspection_work_orders SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(),
      review_note = 'Revisión final: no cumple — ' || p_comment WHERE id = v_wo.id;
    PERFORM public.recompute_inspection_work_status(v_wo.inspection_id);
  END IF;
  INSERT INTO public.inspection_audit_log (inspection_id, action, performed_by, note)
  VALUES (v_wo.inspection_id, CASE WHEN p_complies THEN 'final_check_complies' ELSE 'final_check_not_complies' END, auth.uid(), p_comment);
  RETURN jsonb_build_object('reopened', NOT p_complies);
END $$;
REVOKE EXECUTE ON FUNCTION public.set_work_order_final_inspector(uuid,uuid), public.set_work_item_vacancy_type(uuid,text), public.record_final_check(uuid,boolean,text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.set_work_order_final_inspector(uuid,uuid), public.set_work_item_vacancy_type(uuid,text), public.record_final_check(uuid,boolean,text) TO authenticated;