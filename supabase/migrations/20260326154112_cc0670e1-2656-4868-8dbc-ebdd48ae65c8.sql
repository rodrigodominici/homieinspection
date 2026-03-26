ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS fecha_devolucion_llave date,
  ADD COLUMN IF NOT EXISTS fecha_devolucion_llave_sync_status text NOT NULL DEFAULT 'not_applicable',
  ADD COLUMN IF NOT EXISTS property_overrides_json jsonb;