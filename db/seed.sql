-- Datos de ejemplo para borradores de prueba (Rent Manager · Captación CL).
-- Todo es inventado; no proviene de producción.
-- Contraseña de las tres cuentas de prueba: PruebaRM-2026!
SET search_path = public, extensions;

-- Limpia los datos de ejemplo generados automáticamente (si existen).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['public.inspection_work_order_items','public.inspection_work_orders','public.inspection_signatures','public.inspection_report_versions','public.inspection_reviews','public.inspection_quotation_discounts','public.inspection_repair_items','public.inspection_photos','public.inspection_field_values','public.inspection_sections','public.inspection_external_references','public.inspections','public.inspection_source_events','public.repair_catalog_item_contractor_prices','public.repair_catalog_items','public.repair_catalog_categories','public.inspection_template_fields','public.inspection_template_sections','public.inspection_templates','public.user_roles','public.profiles','public.contractors','auth.identities','auth.users'] LOOP
    IF has_table_privilege(t, 'DELETE') THEN EXECUTE 'DELETE FROM ' || t; END IF;
  END LOOP;
END $$;

-- Cuentas de prueba (Chile)
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new) VALUES
('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'admin.prueba@homie.test', crypt('PruebaRM-2026!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Admin Prueba CL"}', now(), now(), '', '', '', ''),
('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'ejecutivo.prueba@homie.test', crypt('PruebaRM-2026!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Ejecutiva Prueba CL"}', now(), now(), '', '', '', ''),
('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'receptor.prueba@homie.test', crypt('PruebaRM-2026!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Receptor Prueba CL"}', now(), now(), '', '', '', '');

INSERT INTO auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at) VALUES
(gen_random_uuid(), 'a0000000-0000-4000-8000-000000000001', 'email', 'a0000000-0000-4000-8000-000000000001', '{"sub":"a0000000-0000-4000-8000-000000000001","email":"admin.prueba@homie.test","email_verified":true}', now(), now()),
(gen_random_uuid(), 'a0000000-0000-4000-8000-000000000002', 'email', 'a0000000-0000-4000-8000-000000000002', '{"sub":"a0000000-0000-4000-8000-000000000002","email":"ejecutivo.prueba@homie.test","email_verified":true}', now(), now()),
(gen_random_uuid(), 'a0000000-0000-4000-8000-000000000003', 'email', 'a0000000-0000-4000-8000-000000000003', '{"sub":"a0000000-0000-4000-8000-000000000003","email":"receptor.prueba@homie.test","email_verified":true}', now(), now());

-- El alta de usuario crea el perfil pendiente; aquí se aprueba con su rol y país.
UPDATE public.profiles SET role = 'admin', is_active = true, approval_status = 'approved', market = 'CL', markets = '{CL}', country_code = 'CL' WHERE id = 'a0000000-0000-4000-8000-000000000001';
UPDATE public.profiles SET role = 'executive', is_active = true, approval_status = 'approved', market = 'CL', markets = '{CL}', country_code = 'CL' WHERE id = 'a0000000-0000-4000-8000-000000000002';
UPDATE public.profiles SET role = 'inspector', is_active = true, approval_status = 'approved', market = 'CL', markets = '{CL}', country_code = 'CL' WHERE id = 'a0000000-0000-4000-8000-000000000003';

-- Plantilla de captación CL
INSERT INTO public.inspection_templates (id, name, market, property_type, inspection_type, is_active) VALUES
('b0000000-0000-4000-8000-000000000001', 'Captación departamento CL', 'CL', 'departamento', 'captacion', true),
('b0000000-0000-4000-8000-000000000002', 'Captación casa CL', 'CL', 'casa', 'captacion', true);

-- Configuración de mercado CL
INSERT INTO public.market_tax_settings (market, vat_enabled, vat_percentage, vat_label, currency) VALUES
('CL', true, 19.00, 'IVA', 'CLP')
ON CONFLICT (market) DO NOTHING;
-- Búsqueda de inmuebles por API desactivada en pruebas (evita consultar datos reales).
INSERT INTO public.market_realty_api_settings (market, base_url, business_unit, is_active) VALUES
('CL', 'https://api.homierent.com', NULL, false)
ON CONFLICT (market) DO NOTHING;

-- Caso separado para probar los avisos sin cambiar el ejemplo original del intake.
INSERT INTO public.contractors(id,name,country) VALUES('c0000000-0000-4000-8000-000000000003','Contratista de ejemplo','CL') ON CONFLICT(id) DO NOTHING;
INSERT INTO public.inspections(id,property_id,market,property_name,address,property_type,inspection_type,status,scheduled_at,property_snapshot_json)
VALUES('c0000000-0000-4000-8000-000000000001','rm-inm-avisos','CL','Prueba avisos Rent Manager','Dirección de ejemplo CL','departamento','captacion','pending_assignment','2026-11-10','{}') ON CONFLICT(id) DO NOTHING;
INSERT INTO public.inspection_external_references(id,inspection_id,provider,external_object_type,external_object_id,metadata,is_active)
VALUES('c0000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000001','rent_manager','captacion','rm-inm-avisos','{"rm_inspection_id":"rm-insp-avisos"}',true) ON CONFLICT(id) DO NOTHING;

-- Visita editable para disponibilidad/reprogramación; fotos sintéticas, nunca de producción.
INSERT INTO public.inspections(id,property_id,market,property_name,address,property_type,inspection_type,status,inspector_id,executive_id,scheduled_at,property_snapshot_json)
VALUES('d0000000-0000-4000-8000-000000000001','rm-inm-visita','CL','Visita de ejemplo Rent Manager','Dirección inventada CL','departamento','captacion','assigned','a0000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000002','2026-11-10','{"owner_name":"Propietaria de ejemplo"}') ON CONFLICT(id) DO NOTHING;
INSERT INTO public.inspection_external_references(id,inspection_id,provider,external_object_type,external_object_id,metadata,is_active)
VALUES('d0000000-0000-4000-8000-000000000002','d0000000-0000-4000-8000-000000000001','rent_manager','captacion','rm-inm-visita','{"rm_inspection_id":"rm-insp-visita"}',true) ON CONFLICT(id) DO NOTHING;
INSERT INTO public.inspection_sections(id,inspection_id,section_key,section_title,section_type,sort_order)
VALUES('d0000000-0000-4000-8000-000000000003','d0000000-0000-4000-8000-000000000001','marketing_photos','Fotos de comercialización','marketing_photos',1) ON CONFLICT(id) DO NOTHING;
INSERT INTO public.inspection_photos(id,inspection_id,inspection_section_id,storage_path,sort_order,photo_stage)
VALUES
('d0000000-0000-4000-8000-000000000011','d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000003','inspections/d0000000-0000-4000-8000-000000000001/marketing_photos/photo-1.jpg',1,'marketing'),
('d0000000-0000-4000-8000-000000000012','d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000003','inspections/d0000000-0000-4000-8000-000000000001/marketing_photos/photo-2.jpg',2,'marketing'),
('d0000000-0000-4000-8000-000000000013','d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000003','inspections/d0000000-0000-4000-8000-000000000001/marketing_photos/photo-3.jpg',3,'marketing'),
('d0000000-0000-4000-8000-000000000014','d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000003','inspections/d0000000-0000-4000-8000-000000000001/marketing_photos/photo-4.jpg',4,'marketing'),
('d0000000-0000-4000-8000-000000000015','d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000003','inspections/d0000000-0000-4000-8000-000000000001/marketing_photos/photo-5.jpg',5,'marketing'),
('d0000000-0000-4000-8000-000000000016','d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000003','inspections/d0000000-0000-4000-8000-000000000001/marketing_photos/photo-6.jpg',6,'marketing'),
('d0000000-0000-4000-8000-000000000017','d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000003','inspections/d0000000-0000-4000-8000-000000000001/marketing_photos/photo-7.jpg',7,'marketing'),
('d0000000-0000-4000-8000-000000000018','d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000003','inspections/d0000000-0000-4000-8000-000000000001/marketing_photos/photo-8.jpg',8,'marketing'),
('d0000000-0000-4000-8000-000000000019','d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000003','inspections/d0000000-0000-4000-8000-000000000001/marketing_photos/photo-9.jpg',9,'marketing'),
('d0000000-0000-4000-8000-000000000020','d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000003','inspections/d0000000-0000-4000-8000-000000000001/marketing_photos/photo-10.jpg',10,'marketing') ON CONFLICT(id) DO NOTHING;

INSERT INTO public.inspection_sections(id,inspection_id,section_key,section_title,section_type,sort_order)
VALUES('c0000000-0000-4000-8000-000000000004','c0000000-0000-4000-8000-000000000001','marketing_photos','Fotos de comercialización','marketing_photos',1) ON CONFLICT(id) DO NOTHING;
INSERT INTO public.inspection_photos(inspection_id,inspection_section_id,storage_path,sort_order,photo_stage)
SELECT 'c0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000004',replace(storage_path,'d0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001'),sort_order,'marketing' FROM public.inspection_photos WHERE inspection_id='d0000000-0000-4000-8000-000000000001';
INSERT INTO public.inspection_repair_items(id,inspection_id,inspection_section_id,title_snapshot,quantity,unit_price,contractor_unit_price)
VALUES('c0000000-0000-4000-8000-000000000005','c0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000004','Reparación de ejemplo',2,50000,30000) ON CONFLICT(id) DO NOTHING;
INSERT INTO public.inspection_report_versions(id,inspection_id,version_number,status,normalized_payload,public_token,audience)
VALUES('c0000000-0000-4000-8000-000000000006','c0000000-0000-4000-8000-000000000001',1,'published','{}','rm-owner-ejemplo','owner') ON CONFLICT(id) DO NOTHING;
INSERT INTO public.inspection_work_orders(id,inspection_id,contractor_id,status,keys_status,keys_lock_number)
VALUES('c0000000-0000-4000-8000-000000000007','c0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000003','approved','administracion','17') ON CONFLICT(id) DO NOTHING;
