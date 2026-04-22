-- 1. inspection_external_references — decoupled link to external systems (HubSpot, etc.)
CREATE TABLE public.inspection_external_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,
  provider text NOT NULL,
  external_object_type text NOT NULL,
  external_object_id text NOT NULL,
  external_object_type_id text,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One active reference per (inspection, provider, object_type, object_id)
CREATE UNIQUE INDEX inspection_external_refs_active_per_inspection_idx
  ON public.inspection_external_references
    (inspection_id, provider, external_object_type, external_object_id)
  WHERE is_active = true;

-- One active reference per external object across all inspections (no ambiguous routing)
CREATE UNIQUE INDEX inspection_external_refs_active_object_idx
  ON public.inspection_external_references
    (provider, external_object_type, external_object_id)
  WHERE is_active = true;

CREATE INDEX inspection_external_refs_inspection_idx
  ON public.inspection_external_references (inspection_id);

CREATE INDEX inspection_external_refs_lookup_idx
  ON public.inspection_external_references
    (inspection_id, provider, external_object_type)
  WHERE is_active = true;

ALTER TABLE public.inspection_external_references ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage external references"
  ON public.inspection_external_references
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE TRIGGER inspection_external_references_updated_at
  BEFORE UPDATE ON public.inspection_external_references
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. hubspot_sync_log — outbound sync history
CREATE TABLE public.hubspot_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid REFERENCES public.inspections(id) ON DELETE SET NULL,
  external_reference_id uuid REFERENCES public.inspection_external_references(id) ON DELETE SET NULL,
  action text NOT NULL,
  hubspot_object_type_id text,
  hubspot_object_id text,
  request_payload jsonb,
  response_status int,
  response_body jsonb,
  status text NOT NULL,
  error_message text,
  triggered_by uuid,
  event_time timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX hubspot_sync_log_inspection_idx ON public.hubspot_sync_log (inspection_id, created_at DESC);
CREATE INDEX hubspot_sync_log_status_idx ON public.hubspot_sync_log (status, created_at DESC);

ALTER TABLE public.hubspot_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage hubspot sync log"
  ON public.hubspot_sync_log
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));