CREATE TABLE public.quotation_final_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,
  work_order_id uuid NOT NULL REFERENCES public.inspection_work_orders(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  lines_json jsonb NOT NULL,
  approved_subtotal numeric NOT NULL,
  final_subtotal numeric NOT NULL,
  vat_percentage numeric NOT NULL DEFAULT 0,
  final_total numeric NOT NULL,
  currency text NOT NULL,
  note text,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (work_order_id, version_number)
);
GRANT SELECT ON public.quotation_final_settlements TO authenticated;
GRANT ALL ON public.quotation_final_settlements TO service_role;
ALTER TABLE public.quotation_final_settlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY final_settlements_staff_read ON public.quotation_final_settlements FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'executive'));

CREATE OR REPLACE FUNCTION public.create_final_settlement(p_work_order_id uuid, p_lines jsonb, p_note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_wo record; v_insp record; v_tax record; v_item record;
  v_lines jsonb := '[]'::jsonb; v_req jsonb; v_qty numeric;
  v_appr numeric := 0; v_final numeric := 0; v_ver integer; v_id uuid; v_vat numeric := 0;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'executive')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT * INTO v_wo FROM public.inspection_work_orders WHERE id = p_work_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'work_order_not_found'; END IF;
  IF v_wo.status NOT IN ('in_review','approved') THEN RAISE EXCEPTION 'work_order_not_ready'; END IF;
  SELECT market INTO v_insp FROM public.inspections WHERE id = v_wo.inspection_id;
  SELECT * INTO v_tax FROM public.market_tax_settings WHERE market = v_insp.market;
  IF FOUND AND v_tax.vat_enabled THEN v_vat := v_tax.vat_percentage; END IF;

  FOR v_item IN
    SELECT w.id AS wo_item_id, w.status, w.not_done_reason, r.id AS repair_id, r.title_snapshot, r.unit,
           r.quantity, r.unit_price
    FROM public.inspection_work_order_items w
    JOIN public.inspection_repair_items r ON r.id = w.repair_item_id
    WHERE w.work_order_id = p_work_order_id AND NOT w.is_archived AND NOT r.is_pending_quote
    ORDER BY r.sort_order, r.title_snapshot
  LOOP
    SELECT e INTO v_req FROM jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) e
      WHERE e->>'work_order_item_id' = v_item.wo_item_id::text LIMIT 1;
    v_qty := CASE WHEN v_req ? 'final_quantity' THEN (v_req->>'final_quantity')::numeric
                  WHEN v_item.status = 'done' THEN v_item.quantity ELSE 0 END;
    IF v_qty < 0 OR v_qty > v_item.quantity THEN RAISE EXCEPTION 'invalid_final_quantity'; END IF;
    v_appr := v_appr + v_item.quantity * v_item.unit_price;
    v_final := v_final + v_qty * v_item.unit_price;
    v_lines := v_lines || jsonb_build_object(
      'work_order_item_id', v_item.wo_item_id, 'repair_item_id', v_item.repair_id,
      'title', v_item.title_snapshot, 'unit', v_item.unit, 'status', v_item.status,
      'not_done_reason', v_item.not_done_reason,
      'approved_quantity', v_item.quantity, 'final_quantity', v_qty, 'unit_price', v_item.unit_price,
      'approved_subtotal', v_item.quantity * v_item.unit_price, 'final_subtotal', v_qty * v_item.unit_price,
      'comment', NULLIF(btrim(coalesce(v_req->>'comment','')), ''));
  END LOOP;

  SELECT coalesce(max(version_number),0)+1 INTO v_ver FROM public.quotation_final_settlements WHERE work_order_id = p_work_order_id;
  INSERT INTO public.quotation_final_settlements(inspection_id, work_order_id, version_number, lines_json,
    approved_subtotal, final_subtotal, vat_percentage, final_total, currency, note, created_by)
  VALUES (v_wo.inspection_id, p_work_order_id, v_ver, v_lines, v_appr, v_final, v_vat,
    round(v_final * (1 + v_vat/100), 2), CASE WHEN v_insp.market = 'MX' THEN 'MXN' ELSE 'CLP' END,
    NULLIF(btrim(left(coalesce(p_note,''),2000)),''), auth.uid())
  RETURNING id INTO v_id;
  INSERT INTO public.inspection_audit_log(inspection_id, action, performed_by, note)
  VALUES (v_wo.inspection_id, 'final_settlement_created', auth.uid(), 'version=' || v_ver);
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.create_final_settlement(uuid, jsonb, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_final_settlement(uuid, jsonb, text) TO authenticated;