-- 1. Rol contratista y vínculo con empresa
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['admin','inspector','executive','comercial','contractor','pending']));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS contractor_id uuid REFERENCES public.contractors(id) ON DELETE SET NULL;

-- 2. Estado de obra en la inspección
ALTER TABLE public.inspections ADD COLUMN IF NOT EXISTS work_status text NOT NULL DEFAULT 'not_applicable';
ALTER TABLE public.inspections DROP CONSTRAINT IF EXISTS inspections_work_status_check;
ALTER TABLE public.inspections ADD CONSTRAINT inspections_work_status_check
  CHECK (work_status = ANY (ARRAY['not_applicable','in_progress','in_review','done']));

-- 3. Helpers
CREATE OR REPLACE FUNCTION public.current_contractor_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT contractor_id FROM public.profiles
  WHERE id = auth.uid() AND role = 'contractor' AND is_active = true;
$$;

-- 4. Órdenes de trabajo
CREATE TABLE IF NOT EXISTS public.inspection_work_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,
  contractor_id uuid NOT NULL REFERENCES public.contractors(id),
  status text NOT NULL DEFAULT 'open'
    CHECK (status = ANY (ARRAY['open','in_progress','in_review','approved','rejected'])),
  assigned_by uuid REFERENCES public.profiles(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  reviewed_by uuid REFERENCES public.profiles(id),
  reviewed_at timestamptz,
  review_note text,
  contractor_signature_name text,
  contractor_signature_data text,
  contractor_signed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (inspection_id)
);

CREATE TABLE IF NOT EXISTS public.inspection_work_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES public.inspection_work_orders(id) ON DELETE CASCADE,
  repair_item_id uuid NOT NULL REFERENCES public.inspection_repair_items(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status = ANY (ARRAY['pending','in_progress','done','not_done'])),
  not_done_reason text,
  comment text,
  actual_cost numeric,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (work_order_id, repair_item_id)
);

CREATE INDEX IF NOT EXISTS idx_work_orders_contractor ON public.inspection_work_orders(contractor_id, status);
CREATE INDEX IF NOT EXISTS idx_work_order_items_order ON public.inspection_work_order_items(work_order_id);

CREATE TRIGGER trg_work_orders_updated_at BEFORE UPDATE ON public.inspection_work_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_work_order_items_updated_at BEFORE UPDATE ON public.inspection_work_order_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inspection_work_orders TO authenticated;
GRANT ALL ON public.inspection_work_orders TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inspection_work_order_items TO authenticated;
GRANT ALL ON public.inspection_work_order_items TO service_role;

ALTER TABLE public.inspection_work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_work_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wo_admin_all" ON public.inspection_work_orders FOR ALL TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'))
  WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'));

CREATE POLICY "wo_exec_read" ON public.inspection_work_orders FOR SELECT TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'executive'));

CREATE POLICY "wo_exec_write" ON public.inspection_work_orders FOR UPDATE TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'executive'))
  WITH CHECK (public.has_role((SELECT auth.uid()), 'executive'));

CREATE POLICY "wo_exec_insert" ON public.inspection_work_orders FOR INSERT TO authenticated
  WITH CHECK (public.has_role((SELECT auth.uid()), 'executive'));

CREATE POLICY "wo_contractor_read" ON public.inspection_work_orders FOR SELECT TO authenticated
  USING (contractor_id = (SELECT public.current_contractor_id()));

CREATE POLICY "wo_contractor_update" ON public.inspection_work_orders FOR UPDATE TO authenticated
  USING (contractor_id = (SELECT public.current_contractor_id()) AND status IN ('open','in_progress','rejected'))
  WITH CHECK (contractor_id = (SELECT public.current_contractor_id()));

CREATE POLICY "woi_admin_all" ON public.inspection_work_order_items FOR ALL TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'))
  WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'));

CREATE POLICY "woi_exec_all" ON public.inspection_work_order_items FOR ALL TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'executive'))
  WITH CHECK (public.has_role((SELECT auth.uid()), 'executive'));

CREATE POLICY "woi_contractor_read" ON public.inspection_work_order_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.inspection_work_orders w
                 WHERE w.id = work_order_id AND w.contractor_id = (SELECT public.current_contractor_id())));

CREATE POLICY "woi_contractor_update" ON public.inspection_work_order_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.inspection_work_orders w
                 WHERE w.id = work_order_id AND w.contractor_id = (SELECT public.current_contractor_id())
                   AND w.status IN ('open','in_progress','rejected')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.inspection_work_orders w
                 WHERE w.id = work_order_id AND w.contractor_id = (SELECT public.current_contractor_id())));

-- 5. Fotos antes/después
ALTER TABLE public.inspection_photos ADD COLUMN IF NOT EXISTS work_order_item_id uuid
  REFERENCES public.inspection_work_order_items(id) ON DELETE CASCADE;
ALTER TABLE public.inspection_photos ADD COLUMN IF NOT EXISTS photo_stage text;
ALTER TABLE public.inspection_photos DROP CONSTRAINT IF EXISTS inspection_photos_photo_stage_check;
ALTER TABLE public.inspection_photos ADD CONSTRAINT inspection_photos_photo_stage_check
  CHECK (photo_stage IS NULL OR photo_stage = ANY (ARRAY['before','after']));
CREATE INDEX IF NOT EXISTS idx_inspection_photos_work_order_item ON public.inspection_photos(work_order_item_id);

CREATE POLICY "photos_contractor_read" ON public.inspection_photos FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.inspection_work_orders w
                 WHERE w.inspection_id = inspection_photos.inspection_id
                   AND w.contractor_id = (SELECT public.current_contractor_id())));

CREATE POLICY "photos_contractor_insert" ON public.inspection_photos FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.inspection_work_orders w
                 WHERE w.inspection_id = inspection_photos.inspection_id
                   AND w.contractor_id = (SELECT public.current_contractor_id())
                   AND w.status IN ('open','in_progress','rejected')));

CREATE POLICY "photos_contractor_delete" ON public.inspection_photos FOR DELETE TO authenticated
  USING (work_order_item_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.inspection_work_orders w
    WHERE w.inspection_id = inspection_photos.inspection_id
      AND w.contractor_id = (SELECT public.current_contractor_id())
      AND w.status IN ('open','in_progress','rejected')));

-- 6. Lectura de inspecciones y reparaciones para el contratista
CREATE POLICY "inspections_contractor_read" ON public.inspections FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.inspection_work_orders w
                 WHERE w.inspection_id = inspections.id
                   AND w.contractor_id = (SELECT public.current_contractor_id())));

CREATE POLICY "repairs_contractor_read" ON public.inspection_repair_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.inspection_work_orders w
                 WHERE w.inspection_id = inspection_repair_items.inspection_id
                   AND w.contractor_id = (SELECT public.current_contractor_id())));

CREATE POLICY "sections_contractor_read" ON public.inspection_sections FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.inspection_work_orders w
                 WHERE w.inspection_id = inspection_sections.inspection_id
                   AND w.contractor_id = (SELECT public.current_contractor_id())));

-- 7. Storage: el contratista sube y lee bajo el prefijo de sus inspecciones
CREATE POLICY "inspection_photos_contractor_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'inspection-photos' AND EXISTS (
    SELECT 1 FROM public.inspection_work_orders w
    WHERE w.contractor_id = (SELECT public.current_contractor_id())
      AND objects.name LIKE 'inspections/' || w.inspection_id::text || '/%'));

CREATE POLICY "inspection_photos_contractor_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'inspection-photos' AND EXISTS (
    SELECT 1 FROM public.inspection_work_orders w
    WHERE w.contractor_id = (SELECT public.current_contractor_id())
      AND w.status IN ('open','in_progress','rejected')
      AND objects.name LIKE 'inspections/' || w.inspection_id::text || '/%'));

CREATE POLICY "inspection_photos_contractor_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'inspection-photos' AND EXISTS (
    SELECT 1 FROM public.inspection_work_orders w
    WHERE w.contractor_id = (SELECT public.current_contractor_id())
      AND w.status IN ('open','in_progress','rejected')
      AND objects.name LIKE 'inspections/' || w.inspection_id::text || '/%'));

-- 8. RPCs de ciclo de vida
CREATE OR REPLACE FUNCTION public.assign_work_order(p_inspection_id uuid, p_contractor_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role text := public.get_user_role(auth.uid());
  v_insp record;
  v_wo_id uuid;
BEGIN
  IF v_role IS NULL OR v_role NOT IN ('admin','executive') THEN RAISE EXCEPTION 'not_authorized'; END IF;
  SELECT * INTO v_insp FROM public.inspections WHERE id = p_inspection_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'inspection_not_found'; END IF;
  IF v_insp.inspection_type NOT IN ('check_out','captacion') THEN RAISE EXCEPTION 'invalid_inspection_type'; END IF;
  IF COALESCE(v_insp.quien_repara,'') <> 'homie' THEN RAISE EXCEPTION 'quien_repara_must_be_homie'; END IF;

  INSERT INTO public.inspection_work_orders (inspection_id, contractor_id, assigned_by)
  VALUES (p_inspection_id, p_contractor_id, auth.uid())
  ON CONFLICT (inspection_id) DO UPDATE
    SET contractor_id = EXCLUDED.contractor_id,
        assigned_by = EXCLUDED.assigned_by,
        assigned_at = now(),
        status = CASE WHEN public.inspection_work_orders.status = 'approved' THEN 'approved' ELSE 'open' END
  RETURNING id INTO v_wo_id;

  INSERT INTO public.inspection_work_order_items (work_order_id, repair_item_id)
  SELECT v_wo_id, r.id FROM public.inspection_repair_items r
  WHERE r.inspection_id = p_inspection_id
  ON CONFLICT (work_order_id, repair_item_id) DO NOTHING;

  UPDATE public.inspections SET work_status = 'in_progress', contractor_id = p_contractor_id
  WHERE id = p_inspection_id AND work_status <> 'done';

  INSERT INTO public.inspection_audit_log (inspection_id, action, performed_by, note)
  VALUES (p_inspection_id, 'work_order_assigned', auth.uid(), 'contractor=' || p_contractor_id::text);

  RETURN v_wo_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_work_order(p_work_order_id uuid, p_signer_name text, p_signature_data text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_wo record;
  v_pending int;
BEGIN
  SELECT * INTO v_wo FROM public.inspection_work_orders WHERE id = p_work_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'work_order_not_found'; END IF;
  IF v_wo.contractor_id IS DISTINCT FROM public.current_contractor_id()
     AND NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'executive')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF v_wo.status NOT IN ('open','in_progress','rejected') THEN RAISE EXCEPTION 'invalid_status'; END IF;

  SELECT count(*) INTO v_pending FROM public.inspection_work_order_items
  WHERE work_order_id = p_work_order_id AND status NOT IN ('done','not_done');
  IF v_pending > 0 THEN RAISE EXCEPTION 'items_pending:%', v_pending; END IF;

  UPDATE public.inspection_work_orders
     SET status = 'in_review', submitted_at = now(),
         contractor_signature_name = COALESCE(p_signer_name, contractor_signature_name),
         contractor_signature_data = COALESCE(p_signature_data, contractor_signature_data),
         contractor_signed_at = now()
   WHERE id = p_work_order_id;

  UPDATE public.inspections SET work_status = 'in_review' WHERE id = v_wo.inspection_id;

  INSERT INTO public.inspection_audit_log (inspection_id, action, performed_by, note)
  VALUES (v_wo.inspection_id, 'work_order_submitted', auth.uid(), NULL);

  RETURN jsonb_build_object('status','in_review');
END;
$$;

CREATE OR REPLACE FUNCTION public.review_work_order(p_work_order_id uuid, p_approve boolean, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role text := public.get_user_role(auth.uid());
  v_wo record;
BEGIN
  IF v_role IS NULL OR v_role NOT IN ('admin','executive') THEN RAISE EXCEPTION 'not_authorized'; END IF;
  SELECT * INTO v_wo FROM public.inspection_work_orders WHERE id = p_work_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'work_order_not_found'; END IF;
  IF v_wo.status <> 'in_review' THEN RAISE EXCEPTION 'invalid_status'; END IF;
  IF NOT p_approve AND (p_note IS NULL OR length(trim(p_note)) = 0) THEN RAISE EXCEPTION 'note_required'; END IF;

  UPDATE public.inspection_work_orders
     SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
         reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note
   WHERE id = p_work_order_id;

  UPDATE public.inspections
     SET work_status = CASE WHEN p_approve THEN 'done' ELSE 'in_progress' END
   WHERE id = v_wo.inspection_id;

  INSERT INTO public.inspection_audit_log (inspection_id, action, performed_by, note)
  VALUES (v_wo.inspection_id,
          CASE WHEN p_approve THEN 'work_order_approved' ELSE 'work_order_rejected' END,
          auth.uid(), p_note);

  RETURN jsonb_build_object('status', CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END);
END;
$$;

-- 9. Finalizar exige obra terminada cuando repara Homie
CREATE OR REPLACE FUNCTION public.finalize_inspection(p_inspection_id uuid, p_note text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
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

  IF NOT (
    v_insp.status IN ('approved', 'accepted')
    OR (v_insp.status = 'published' AND v_insp.owner_feedback_status = 'accepted')
  ) THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;

  IF v_insp.inspection_type <> 'check_in' AND v_insp.quien_repara IS NULL THEN
    RAISE EXCEPTION 'quien_repara_required';
  END IF;

  -- Cuando repara Homie, la obra debe estar terminada y aprobada.
  IF v_insp.quien_repara = 'homie' AND v_insp.work_status <> 'done' THEN
    RAISE EXCEPTION 'work_not_done';
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