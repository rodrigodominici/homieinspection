CREATE TABLE public.work_order_execution_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,
  work_order_id uuid NOT NULL REFERENCES public.inspection_work_orders(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  work_order_status text NOT NULL,
  payload_json jsonb NOT NULL,
  note text,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (work_order_id, version_number)
);
GRANT SELECT ON public.work_order_execution_reports TO authenticated;
GRANT ALL ON public.work_order_execution_reports TO service_role;
ALTER TABLE public.work_order_execution_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY execution_reports_staff_read ON public.work_order_execution_reports FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'executive'));

CREATE OR REPLACE FUNCTION public.create_execution_report_version(p_work_order_id uuid, p_note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_wo record; v_items jsonb; v_ver integer; v_id uuid; v_contractor text;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'executive')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT * INTO v_wo FROM public.inspection_work_orders WHERE id = p_work_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'work_order_not_found'; END IF;
  SELECT name INTO v_contractor FROM public.contractors WHERE id = v_wo.contractor_id;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'work_order_item_id', w.id, 'title', r.title_snapshot, 'quantity', r.quantity, 'unit', r.unit,
      'section', s.section_title, 'status', w.status, 'comment', w.comment, 'not_done_reason', w.not_done_reason,
      'completed_at', w.completed_at,
      'photos', (SELECT coalesce(jsonb_agg(jsonb_build_object('storage_path', p.storage_path, 'stage', p.photo_stage)
                  ORDER BY p.sort_order, p.created_at, p.id), '[]'::jsonb)
                 FROM public.inspection_photos p WHERE p.work_order_item_id = w.id)
    ) ORDER BY s.sort_order, r.sort_order, r.title_snapshot), '[]'::jsonb)
  INTO v_items
  FROM public.inspection_work_order_items w
  JOIN public.inspection_repair_items r ON r.id = w.repair_item_id
  LEFT JOIN public.inspection_sections s ON s.id = r.inspection_section_id
  WHERE w.work_order_id = p_work_order_id AND NOT w.is_archived;

  SELECT coalesce(max(version_number),0)+1 INTO v_ver FROM public.work_order_execution_reports WHERE work_order_id = p_work_order_id;
  INSERT INTO public.work_order_execution_reports(inspection_id, work_order_id, version_number, work_order_status, payload_json, note, created_by)
  VALUES (v_wo.inspection_id, p_work_order_id, v_ver, v_wo.status, jsonb_build_object(
      'contractor', v_contractor, 'items', v_items, 'keys_status', v_wo.keys_status,
      'keys_lock_number', v_wo.keys_lock_number, 'keys_lock_code', v_wo.keys_lock_code,
      'signature_name', v_wo.contractor_signature_name, 'signed_at', v_wo.contractor_signed_at,
      'submitted_at', v_wo.submitted_at, 'review_note', v_wo.review_note),
    NULLIF(btrim(left(coalesce(p_note,''),2000)),''), auth.uid())
  RETURNING id INTO v_id;
  INSERT INTO public.inspection_audit_log(inspection_id, action, performed_by, note)
  VALUES (v_wo.inspection_id, 'execution_report_version_created', auth.uid(), 'version=' || v_ver);
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.create_execution_report_version(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_execution_report_version(uuid, text) TO authenticated;