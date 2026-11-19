ALTER TABLE public.inspection_work_orders DROP CONSTRAINT IF EXISTS inspection_work_orders_inspection_id_key;
CREATE INDEX IF NOT EXISTS idx_work_orders_inspection ON public.inspection_work_orders(inspection_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_work_order_item_repair ON public.inspection_work_order_items(repair_item_id) WHERE NOT is_archived;

CREATE OR REPLACE FUNCTION public.recompute_inspection_work_status(p_inspection_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_total int; v_approved int; v_review int; v_status text;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE status='approved'), count(*) FILTER (WHERE status='in_review')
    INTO v_total, v_approved, v_review FROM public.inspection_work_orders WHERE inspection_id=p_inspection_id;
  IF v_total = 0 THEN RETURN NULL; END IF;
  v_status := CASE WHEN v_approved = v_total THEN 'done'
                   WHEN v_review > 0 AND v_review + v_approved = v_total THEN 'in_review'
                   ELSE 'in_progress' END;
  UPDATE public.inspections SET work_status = v_status WHERE id = p_inspection_id;
  RETURN v_status;
END $$;
REVOKE EXECUTE ON FUNCTION public.recompute_inspection_work_status(uuid) FROM anon, public, authenticated;

CREATE OR REPLACE FUNCTION public.assign_work_order(p_inspection_id uuid, p_contractor_id uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_role text := public.get_user_role(auth.uid());
  v_insp record;
  v_wo_id uuid;
BEGIN
  IF v_role IS NULL OR v_role NOT IN ('admin','executive') THEN RAISE EXCEPTION 'not_authorized'; END IF;
  PERFORM public.authorize_quotation_revision(p_inspection_id);
  SELECT * INTO v_insp FROM public.inspections WHERE id = p_inspection_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'inspection_not_found'; END IF;
  IF v_insp.inspection_type NOT IN ('check_out','captacion') THEN RAISE EXCEPTION 'invalid_inspection_type'; END IF;
  IF COALESCE(v_insp.quien_repara,'') <> 'homie' THEN RAISE EXCEPTION 'quien_repara_must_be_homie'; END IF;
  IF EXISTS(SELECT 1 FROM public.inspection_work_orders WHERE inspection_id=p_inspection_id) THEN RAISE EXCEPTION 'use_quotation_revision'; END IF;

  INSERT INTO public.inspection_work_orders (inspection_id, contractor_id, assigned_by)
  VALUES (p_inspection_id, p_contractor_id, auth.uid()) RETURNING id INTO v_wo_id;

  INSERT INTO public.inspection_work_order_items (work_order_id, repair_item_id)
  SELECT v_wo_id, r.id FROM public.inspection_repair_items r
  WHERE r.inspection_id = p_inspection_id AND NOT r.is_pending_quote AND NOT r.is_archived
  ON CONFLICT DO NOTHING;

  UPDATE public.inspections SET work_status = 'in_progress', contractor_id = p_contractor_id
  WHERE id = p_inspection_id AND work_status <> 'done';

  INSERT INTO public.inspection_audit_log (inspection_id, action, performed_by, note)
  VALUES (p_inspection_id, 'work_order_assigned', auth.uid(), 'contractor=' || p_contractor_id::text);
  RETURN v_wo_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assign_additional_work_order(p_inspection_id uuid, p_contractor_id uuid, p_repair_item_ids uuid[])
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_role text := public.get_user_role(auth.uid());
  v_insp record;
  v_wo_id uuid;
  v_valid int;
BEGIN
  IF v_role IS NULL OR v_role NOT IN ('admin','executive') THEN RAISE EXCEPTION 'not_authorized'; END IF;
  PERFORM public.authorize_quotation_revision(p_inspection_id);
  SELECT * INTO v_insp FROM public.inspections WHERE id = p_inspection_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'inspection_not_found'; END IF;
  IF COALESCE(v_insp.quien_repara,'') <> 'homie' THEN RAISE EXCEPTION 'quien_repara_must_be_homie'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.contractors WHERE id=p_contractor_id AND is_active) THEN RAISE EXCEPTION 'contractor_not_found'; END IF;
  IF p_repair_item_ids IS NULL OR cardinality(p_repair_item_ids) = 0 THEN RAISE EXCEPTION 'items_required'; END IF;

  SELECT count(*) INTO v_valid FROM public.inspection_repair_items r
  WHERE r.id = ANY(p_repair_item_ids) AND r.inspection_id = p_inspection_id
    AND NOT r.is_pending_quote AND NOT r.is_archived
    AND NOT EXISTS (SELECT 1 FROM public.inspection_work_order_items wi WHERE wi.repair_item_id = r.id AND NOT wi.is_archived);
  IF v_valid <> cardinality(p_repair_item_ids) THEN RAISE EXCEPTION 'items_not_available'; END IF;

  INSERT INTO public.inspection_work_orders (inspection_id, contractor_id, assigned_by)
  VALUES (p_inspection_id, p_contractor_id, auth.uid()) RETURNING id INTO v_wo_id;
  INSERT INTO public.inspection_work_order_items (work_order_id, repair_item_id)
  SELECT v_wo_id, unnest(p_repair_item_ids);

  UPDATE public.inspections SET work_status = 'in_progress' WHERE id = p_inspection_id;
  INSERT INTO public.inspection_audit_log (inspection_id, action, performed_by, note)
  VALUES (p_inspection_id, 'additional_work_order_assigned', auth.uid(), 'contractor=' || p_contractor_id::text || ' items=' || cardinality(p_repair_item_ids));
  RETURN v_wo_id;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.assign_additional_work_order(uuid, uuid, uuid[]) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.assign_additional_work_order(uuid, uuid, uuid[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.review_work_order(p_work_order_id uuid, p_approve boolean, p_note text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_role text := public.get_user_role(auth.uid());
  v_wo record;
BEGIN
  IF v_role IS NULL OR v_role NOT IN ('admin','executive') THEN RAISE EXCEPTION 'not_authorized'; END IF;
  SELECT * INTO v_wo FROM public.inspection_work_orders WHERE id = p_work_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'work_order_not_found'; END IF;
  PERFORM public.authorize_quotation_revision(v_wo.inspection_id);
  IF v_wo.status <> 'in_review' THEN RAISE EXCEPTION 'invalid_status'; END IF;
  IF NOT p_approve AND (p_note IS NULL OR length(trim(p_note)) = 0) THEN RAISE EXCEPTION 'note_required'; END IF;

  UPDATE public.inspection_work_orders
     SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
         reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note
   WHERE id = p_work_order_id;
  PERFORM public.recompute_inspection_work_status(v_wo.inspection_id);

  INSERT INTO public.inspection_audit_log (inspection_id, action, performed_by, note)
  VALUES (v_wo.inspection_id, CASE WHEN p_approve THEN 'work_order_approved' ELSE 'work_order_rejected' END, auth.uid(), p_note);
  RETURN jsonb_build_object('status', CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END);
END;
$function$;

CREATE OR REPLACE FUNCTION public.submit_work_order(p_work_order_id uuid, p_signer_name text, p_signature_data text, p_keys_status text DEFAULT NULL::text, p_keys_lock_number text DEFAULT NULL::text, p_keys_lock_code text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_wo record;
  v_pending int;
  v_keys text := NULLIF(trim(COALESCE(p_keys_status,'')),'');
BEGIN
  SELECT * INTO v_wo FROM public.inspection_work_orders WHERE id = p_work_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'work_order_not_found'; END IF;
  IF v_wo.contractor_id IS DISTINCT FROM public.current_contractor_id()
     AND NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'executive')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF v_wo.status NOT IN ('in_progress','rejected') THEN RAISE EXCEPTION 'invalid_status'; END IF;
  v_keys := COALESCE(v_keys, v_wo.keys_status);
  IF v_keys IS NULL THEN RAISE EXCEPTION 'keys_status_required'; END IF;
  IF v_keys NOT IN ('homie','administracion','responsable_autorizado','propietario','proveedor','candado') THEN RAISE EXCEPTION 'invalid_keys_status'; END IF;
  IF v_keys = 'candado' AND (NULLIF(trim(COALESCE(p_keys_lock_number,'')),'') IS NULL OR NULLIF(trim(COALESCE(p_keys_lock_code,'')),'') IS NULL) THEN
    RAISE EXCEPTION 'lock_details_required';
  END IF;
  SELECT count(*) INTO v_pending FROM public.inspection_work_order_items
  WHERE work_order_id = p_work_order_id AND NOT is_archived AND status NOT IN ('done','not_done');
  IF v_pending > 0 THEN RAISE EXCEPTION 'items_pending:%', v_pending; END IF;

  UPDATE public.inspection_work_orders
     SET status = 'in_review', submitted_at = now(),
         contractor_signature_name = COALESCE(p_signer_name, contractor_signature_name),
         contractor_signature_data = COALESCE(p_signature_data, contractor_signature_data),
         contractor_signed_at = now(),
         keys_status = v_keys,
         keys_lock_number = CASE WHEN v_keys = 'candado' THEN trim(p_keys_lock_number) ELSE NULL END,
         keys_lock_code = CASE WHEN v_keys = 'candado' THEN trim(p_keys_lock_code) ELSE NULL END
   WHERE id = p_work_order_id;
  PERFORM public.recompute_inspection_work_status(v_wo.inspection_id);

  INSERT INTO public.inspection_audit_log (inspection_id, action, performed_by, note)
  VALUES (v_wo.inspection_id, 'work_order_submitted', auth.uid(), 'llaves=' || v_keys);
  RETURN jsonb_build_object('status','in_review');
END;
$function$;