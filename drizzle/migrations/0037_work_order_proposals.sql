CREATE TABLE public.work_order_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES public.inspection_work_orders(id) ON DELETE CASCADE,
  inspection_id uuid NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,
  inspection_section_id uuid REFERENCES public.inspection_sections(id) ON DELETE SET NULL,
  title text NOT NULL,
  comment text,
  proposed_cost numeric NOT NULL DEFAULT 0,
  photo_path text,
  status text NOT NULL DEFAULT 'pending',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  repair_item_id uuid REFERENCES public.inspection_repair_items(id) ON DELETE SET NULL
);
CREATE INDEX idx_wop_work_order ON public.work_order_proposals(work_order_id);
GRANT SELECT, INSERT ON public.work_order_proposals TO authenticated;
GRANT ALL ON public.work_order_proposals TO service_role;
ALTER TABLE public.work_order_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY wop_contractor_select ON public.work_order_proposals FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.inspection_work_orders w WHERE w.id = work_order_id AND w.contractor_id = public.current_contractor_id()));
CREATE POLICY wop_staff_select ON public.work_order_proposals FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'executive'));
CREATE POLICY wop_contractor_insert ON public.work_order_proposals FOR INSERT TO authenticated
WITH CHECK (status = 'pending' AND created_by = auth.uid() AND decided_by IS NULL AND repair_item_id IS NULL
  AND proposed_cost >= 0 AND length(trim(title)) > 0
  AND EXISTS (SELECT 1 FROM public.inspection_work_orders w WHERE w.id = work_order_id AND w.inspection_id = work_order_proposals.inspection_id
     AND w.contractor_id = public.current_contractor_id() AND w.status IN ('open','in_progress','rejected')));

CREATE OR REPLACE FUNCTION public.decide_work_order_proposal(p_proposal_id uuid, p_approve boolean, p_owner_price numeric DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_p record; v_section uuid; v_item uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'executive')) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  SELECT * INTO v_p FROM public.work_order_proposals WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'proposal_not_found'; END IF;
  IF v_p.status <> 'pending' THEN RAISE EXCEPTION 'already_decided'; END IF;
  IF NOT p_approve THEN
    IF p_note IS NULL OR length(trim(p_note)) = 0 THEN RAISE EXCEPTION 'note_required'; END IF;
    UPDATE public.work_order_proposals SET status='rejected', decided_by=auth.uid(), decided_at=now(), decision_note=p_note WHERE id=p_proposal_id;
    RETURN NULL;
  END IF;
  IF p_owner_price IS NULL OR p_owner_price < 0 THEN RAISE EXCEPTION 'owner_price_required'; END IF;
  v_section := COALESCE(v_p.inspection_section_id, (SELECT id FROM public.inspection_sections WHERE inspection_id=v_p.inspection_id AND section_key='closing_operational' LIMIT 1),
                        (SELECT id FROM public.inspection_sections WHERE inspection_id=v_p.inspection_id ORDER BY sort_order LIMIT 1));
  INSERT INTO public.inspection_repair_items (inspection_id, inspection_section_id, title_snapshot, description_snapshot, category_snapshot,
     quantity, unit_price, contractor_unit_price, subtotal, notes, created_by, updated_by, sort_order)
  VALUES (v_p.inspection_id, v_section, v_p.title, v_p.comment, 'Propuesta del contratista', 1, p_owner_price, v_p.proposed_cost, p_owner_price,
     NULLIF(trim(COALESCE(p_note,'')),''), auth.uid(), auth.uid(), 9000)
  RETURNING id INTO v_item;
  UPDATE public.work_order_proposals SET status='approved', decided_by=auth.uid(), decided_at=now(), decision_note=p_note, repair_item_id=v_item WHERE id=p_proposal_id;
  INSERT INTO public.inspection_audit_log (inspection_id, action, performed_by, note) VALUES (v_p.inspection_id, 'contractor_proposal_approved', auth.uid(), v_p.title);
  RETURN v_item;
END $$;
REVOKE EXECUTE ON FUNCTION public.decide_work_order_proposal(uuid, boolean, numeric, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.decide_work_order_proposal(uuid, boolean, numeric, text) TO authenticated, service_role;

-- Partidas nacidas de propuestas solo pueden ir a una OT si el inversionista las aceptó.
CREATE OR REPLACE FUNCTION public.repair_item_ready_for_work(p_repair_item_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.work_order_proposals WHERE repair_item_id = p_repair_item_id)
      OR COALESCE((SELECT f.decision = 'accepted' FROM public.inspection_owner_feedback f
                   WHERE f.repair_item_id = p_repair_item_id ORDER BY f.submitted_at DESC LIMIT 1), false)
$$;
GRANT EXECUTE ON FUNCTION public.repair_item_ready_for_work(uuid) TO authenticated, service_role;

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
    AND public.repair_item_ready_for_work(r.id)
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