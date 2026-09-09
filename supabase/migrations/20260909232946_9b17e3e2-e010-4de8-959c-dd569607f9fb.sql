ALTER TABLE public.inspection_work_orders
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_by uuid,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS contractor_rejection_reason text,
  ADD COLUMN IF NOT EXISTS keys_status text,
  ADD COLUMN IF NOT EXISTS keys_lock_number text,
  ADD COLUMN IF NOT EXISTS keys_lock_code text;

ALTER TABLE public.inspection_work_orders DROP CONSTRAINT IF EXISTS inspection_work_orders_status_check;
ALTER TABLE public.inspection_work_orders ADD CONSTRAINT inspection_work_orders_status_check
  CHECK (status = ANY (ARRAY['open','in_progress','in_review','approved','rejected','contractor_rejected']));

ALTER TABLE public.inspection_work_orders DROP CONSTRAINT IF EXISTS inspection_work_orders_keys_status_check;
ALTER TABLE public.inspection_work_orders ADD CONSTRAINT inspection_work_orders_keys_status_check
  CHECK (keys_status IS NULL OR keys_status = ANY (ARRAY['homie','administracion','responsable_autorizado','propietario','proveedor','candado']));

-- Aceptar la orden (contratista de la empresa asignada, o admin/ejecutivo)
CREATE OR REPLACE FUNCTION public.accept_work_order(p_work_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_wo record;
BEGIN
  SELECT * INTO v_wo FROM public.inspection_work_orders WHERE id = p_work_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'work_order_not_found'; END IF;
  IF v_wo.contractor_id IS DISTINCT FROM public.current_contractor_id()
     AND NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'executive')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF v_wo.status NOT IN ('open','rejected') THEN RAISE EXCEPTION 'invalid_status'; END IF;

  UPDATE public.inspection_work_orders
     SET status = 'in_progress',
         accepted_at = COALESCE(accepted_at, now()),
         accepted_by = COALESCE(accepted_by, auth.uid()),
         rejected_at = NULL,
         contractor_rejection_reason = NULL
   WHERE id = p_work_order_id;

  UPDATE public.inspections SET work_status = 'in_progress'
   WHERE id = v_wo.inspection_id AND work_status <> 'done';

  INSERT INTO public.inspection_audit_log (inspection_id, action, performed_by, note)
  VALUES (v_wo.inspection_id, 'work_order_accepted', auth.uid(), NULL);

  RETURN jsonb_build_object('status','in_progress');
END;
$function$;

-- Rechazo de la orden por parte del contratista
CREATE OR REPLACE FUNCTION public.contractor_reject_work_order(p_work_order_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_wo record;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN RAISE EXCEPTION 'reason_required'; END IF;
  SELECT * INTO v_wo FROM public.inspection_work_orders WHERE id = p_work_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'work_order_not_found'; END IF;
  IF v_wo.contractor_id IS DISTINCT FROM public.current_contractor_id()
     AND NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'executive')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF v_wo.status NOT IN ('open','in_progress','rejected') THEN RAISE EXCEPTION 'invalid_status'; END IF;

  UPDATE public.inspection_work_orders
     SET status = 'contractor_rejected',
         rejected_at = now(),
         contractor_rejection_reason = trim(p_reason),
         accepted_at = NULL,
         accepted_by = NULL
   WHERE id = p_work_order_id;

  INSERT INTO public.inspection_audit_log (inspection_id, action, performed_by, note)
  VALUES (v_wo.inspection_id, 'work_order_rejected_by_contractor', auth.uid(), trim(p_reason));

  RETURN jsonb_build_object('status','contractor_rejected');
END;
$function$;

-- Reasignación a otra empresa contratista
CREATE OR REPLACE FUNCTION public.reassign_work_order(p_work_order_id uuid, p_contractor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role text := public.get_user_role(auth.uid());
  v_wo record;
BEGIN
  IF v_role IS NULL OR v_role NOT IN ('admin','executive') THEN RAISE EXCEPTION 'not_authorized'; END IF;
  SELECT * INTO v_wo FROM public.inspection_work_orders WHERE id = p_work_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'work_order_not_found'; END IF;
  IF v_wo.status = 'approved' THEN RAISE EXCEPTION 'invalid_status'; END IF;

  UPDATE public.inspection_work_orders
     SET contractor_id = p_contractor_id,
         status = 'open',
         assigned_by = auth.uid(),
         assigned_at = now(),
         accepted_at = NULL,
         accepted_by = NULL,
         rejected_at = NULL,
         contractor_rejection_reason = NULL,
         review_note = NULL,
         submitted_at = NULL,
         contractor_signature_name = NULL,
         contractor_signature_data = NULL,
         contractor_signed_at = NULL,
         keys_status = NULL,
         keys_lock_number = NULL,
         keys_lock_code = NULL
   WHERE id = p_work_order_id;

  UPDATE public.inspections
     SET work_status = 'in_progress', contractor_id = p_contractor_id
   WHERE id = v_wo.inspection_id AND work_status <> 'done';

  INSERT INTO public.inspection_audit_log (inspection_id, action, performed_by, note)
  VALUES (v_wo.inspection_id, 'work_order_reassigned', auth.uid(), 'contractor=' || p_contractor_id::text);

  RETURN jsonb_build_object('status','open');
END;
$function$;

-- Envío a revisión con estado de llaves obligatorio
CREATE OR REPLACE FUNCTION public.submit_work_order(
  p_work_order_id uuid,
  p_signer_name text,
  p_signature_data text,
  p_keys_status text DEFAULT NULL,
  p_keys_lock_number text DEFAULT NULL,
  p_keys_lock_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
  IF v_keys NOT IN ('homie','administracion','responsable_autorizado','propietario','proveedor','candado') THEN
    RAISE EXCEPTION 'invalid_keys_status';
  END IF;
  IF v_keys = 'candado' AND (
       NULLIF(trim(COALESCE(p_keys_lock_number,'')),'') IS NULL
    OR NULLIF(trim(COALESCE(p_keys_lock_code,'')),'') IS NULL) THEN
    RAISE EXCEPTION 'lock_details_required';
  END IF;

  SELECT count(*) INTO v_pending FROM public.inspection_work_order_items
  WHERE work_order_id = p_work_order_id AND status NOT IN ('done','not_done');
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

  UPDATE public.inspections SET work_status = 'in_review' WHERE id = v_wo.inspection_id;

  INSERT INTO public.inspection_audit_log (inspection_id, action, performed_by, note)
  VALUES (v_wo.inspection_id, 'work_order_submitted', auth.uid(), 'llaves=' || v_keys);

  RETURN jsonb_build_object('status','in_review');
END;
$function$;

DROP FUNCTION IF EXISTS public.submit_work_order(uuid, text, text);

-- El contratista solo edita ítems de órdenes ya aceptadas
DROP POLICY IF EXISTS "Contractor updates own work order items" ON public.inspection_work_order_items;
CREATE POLICY "Contractor updates accepted work order items"
ON public.inspection_work_order_items FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.inspection_work_orders wo
  WHERE wo.id = inspection_work_order_items.work_order_id
    AND wo.contractor_id = public.current_contractor_id()
    AND wo.status IN ('in_progress','rejected')
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.inspection_work_orders wo
  WHERE wo.id = inspection_work_order_items.work_order_id
    AND wo.contractor_id = public.current_contractor_id()
    AND wo.status IN ('in_progress','rejected')
));

-- Lectura del informe de hallazgos por parte del contratista
DROP POLICY IF EXISTS "Contractor reads sections of own work orders" ON public.inspection_sections;
CREATE POLICY "Contractor reads sections of own work orders"
ON public.inspection_sections FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.inspection_work_orders wo
  WHERE wo.inspection_id = inspection_sections.inspection_id
    AND wo.contractor_id = public.current_contractor_id()
));

DROP POLICY IF EXISTS "Contractor reads field values of own work orders" ON public.inspection_field_values;
CREATE POLICY "Contractor reads field values of own work orders"
ON public.inspection_field_values FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.inspection_work_orders wo
  WHERE wo.inspection_id = inspection_field_values.inspection_id
    AND wo.contractor_id = public.current_contractor_id()
));

DROP POLICY IF EXISTS "Contractor reads photos of own work orders" ON public.inspection_photos;
CREATE POLICY "Contractor reads photos of own work orders"
ON public.inspection_photos FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.inspection_work_orders wo
  WHERE wo.inspection_id = inspection_photos.inspection_id
    AND wo.contractor_id = public.current_contractor_id()
));