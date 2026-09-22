UPDATE public.profiles
SET full_name = 'Property Advisor Demo',
    role = 'property_advisor',
    approval_status = 'approved',
    is_active = true,
    market = 'CL',
    markets = ARRAY['CL']::text[],
    updated_at = now()
WHERE id = '1ca87b0e-475e-4206-afe2-8647ede7a07a';

INSERT INTO public.inspection_source_events (source, event_type, external_event_id, external_object_id, payload_version, processing_status, payload_json)
VALUES (
  'hubspot',
  'inspection.create',
  'demo_checkin_capacitacion_' || to_char(now(), 'YYYYMMDDHH24MISS'),
  'demo_contrato_checkin_capacitacion',
  'v1',
  'received',
  jsonb_build_object(
    'source', 'hubspot',
    'event_type', 'inspection.create',
    'payload_version', 'v1',
    'external_event_id', 'demo_checkin_capacitacion',
    'external_object_id', 'demo_contrato_checkin_capacitacion',
    'data', jsonb_build_object(
      'market', 'CL',
      'property_id', 'DEMO-CHECKIN-01',
      'address', 'Av. Providencia, 1234, D 802, Providencia, Santiago',
      'property_name', 'DEMO Capacitación Check-in - Providencia 1234 D 802',
      'property_type', 'departamento',
      'bedrooms_count', 2,
      'bathrooms_count', 2,
      'has_parking', true,
      'parking_number', 'E-45',
      'has_storage', true,
      'storage_number', 'B-12',
      'tenant_name', 'Inquilino Demo Capacitación',
      'tenant_whatsapp', '+56900000000',
      'scheduled_at', to_char(now() + interval '1 day', 'YYYY-MM-DD'),
      'inspection_type', 'check_in',
      'inspector_email', 'checkin.demo@homie.mx',
      'executive_email', NULL
    )
  )
);