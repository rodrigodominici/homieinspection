ALTER TABLE public.inspection_work_orders ADD COLUMN IF NOT EXISTS contractor_message text;

DROP POLICY IF EXISTS inspections_contractor_read ON public.inspections;

CREATE OR REPLACE FUNCTION public.contractor_inspection_summaries(p_ids uuid[])
RETURNS TABLE(id uuid, property_id text, property_name text, address text, market text, inspection_type text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.id, i.property_id, i.property_name, i.address, i.market, i.inspection_type
  FROM public.inspections i
  WHERE i.id = ANY(p_ids)
    AND (
      EXISTS (SELECT 1 FROM public.inspection_work_orders w WHERE w.inspection_id = i.id AND w.contractor_id = public.current_contractor_id())
      OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'executive')
    );
$$;
REVOKE ALL ON FUNCTION public.contractor_inspection_summaries(uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.contractor_inspection_summaries(uuid[]) TO authenticated;

DROP POLICY IF EXISTS "Contractor reads field values of own work orders" ON public.inspection_field_values;
CREATE POLICY "Contractor reads field values of own work orders" ON public.inspection_field_values
FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.inspection_work_orders wo
          WHERE wo.inspection_id = inspection_field_values.inspection_id AND wo.contractor_id = public.current_contractor_id())
  AND lower(field_label) !~ '(correo|email|mail|tel|celular|whatsapp|rut|inquilin|propietari|arrendatari|contacto|receptor)'
);

CREATE OR REPLACE FUNCTION public.set_work_order_message(p_work_order_id uuid, p_message text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'executive')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.inspection_work_orders SET contractor_message = NULLIF(btrim(left(p_message, 2000)), ''), updated_at = now()
  WHERE id = p_work_order_id;
END $$;
REVOKE ALL ON FUNCTION public.set_work_order_message(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_work_order_message(uuid, text) TO authenticated;