ALTER TABLE public.work_order_final_checks ADD COLUMN photo_path text;

CREATE OR REPLACE FUNCTION public.record_final_check(p_item_id uuid, p_complies boolean, p_comment text, p_photo_path text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_item record; v_wo record;
BEGIN
  SELECT * INTO v_item FROM public.inspection_work_order_items WHERE id = p_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'item_not_found'; END IF;
  SELECT * INTO v_wo FROM public.inspection_work_orders WHERE id = v_item.work_order_id FOR UPDATE;
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'executive') OR v_wo.final_inspector_id = auth.uid()) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF v_wo.status NOT IN ('in_review','approved') THEN RAISE EXCEPTION 'invalid_status'; END IF;
  IF NOT p_complies AND (p_comment IS NULL OR length(trim(p_comment)) = 0) THEN RAISE EXCEPTION 'note_required'; END IF;
  IF p_photo_path IS NOT NULL AND p_photo_path NOT LIKE 'inspections/' || v_wo.inspection_id::text || '/final_checks/%' THEN RAISE EXCEPTION 'invalid_photo_path'; END IF;
  INSERT INTO public.work_order_final_checks (work_order_id, work_order_item_id, inspection_id, result, comment, checked_by, photo_path)
  VALUES (v_wo.id, p_item_id, v_wo.inspection_id, CASE WHEN p_complies THEN 'complies' ELSE 'not_complies' END, p_comment, auth.uid(), p_photo_path);
  IF NOT p_complies THEN
    UPDATE public.inspection_work_orders SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(),
      review_note = 'Revisión final: no cumple — ' || p_comment WHERE id = v_wo.id;
    PERFORM public.recompute_inspection_work_status(v_wo.inspection_id);
  END IF;
  INSERT INTO public.inspection_audit_log (inspection_id, action, performed_by, note)
  VALUES (v_wo.inspection_id, CASE WHEN p_complies THEN 'final_check_complies' ELSE 'final_check_not_complies' END, auth.uid(), p_comment);
  RETURN jsonb_build_object('reopened', NOT p_complies);
END $$;

CREATE OR REPLACE FUNCTION public.record_final_check(p_item_id uuid, p_complies boolean, p_comment text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.record_final_check(p_item_id, p_complies, p_comment, NULL::text) $$;

CREATE OR REPLACE FUNCTION public.my_final_check_assignments()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'work_order_id', w.id, 'status', w.status, 'inspection_id', i.id,
    'property_name', i.property_name, 'address', i.address, 'market', i.market,
    'items', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', it.id, 'title', r.title_snapshot, 'vacancy_type', it.vacancy_type,
        'last', (SELECT jsonb_build_object('result', c.result, 'comment', c.comment, 'created_at', c.created_at)
                 FROM public.work_order_final_checks c WHERE c.work_order_item_id = it.id ORDER BY c.created_at DESC LIMIT 1)
      ) ORDER BY r.sort_order), '[]'::jsonb)
      FROM public.inspection_work_order_items it JOIN public.inspection_repair_items r ON r.id = it.repair_item_id
      WHERE it.work_order_id = w.id AND NOT it.is_archived)
  ) ORDER BY w.assigned_at DESC), '[]'::jsonb)
  FROM public.inspection_work_orders w JOIN public.inspections i ON i.id = w.inspection_id
  WHERE w.final_inspector_id = auth.uid() AND w.status IN ('in_review','approved','rejected','in_progress','open')
$$;

REVOKE EXECUTE ON FUNCTION public.record_final_check(uuid,boolean,text,text), public.my_final_check_assignments() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.record_final_check(uuid,boolean,text,text), public.my_final_check_assignments() TO authenticated;

CREATE POLICY inspection_photos_final_inspector_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'inspection-photos' AND EXISTS (SELECT 1 FROM public.inspection_work_orders w
  WHERE w.final_inspector_id = auth.uid() AND objects.name LIKE 'inspections/' || w.inspection_id::text || '/final_checks/%'));
CREATE POLICY inspection_photos_final_inspector_select ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'inspection-photos' AND EXISTS (SELECT 1 FROM public.inspection_work_orders w
  WHERE w.final_inspector_id = auth.uid() AND objects.name LIKE 'inspections/' || w.inspection_id::text || '/final_checks/%'));