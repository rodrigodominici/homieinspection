
-- communication_rules
CREATE TABLE public.communication_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  event_name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  channel text NOT NULL,
  provider_key text NOT NULL,
  template_key text NOT NULL,
  recipient_type text NOT NULL,
  market text,
  conditions_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_communication_rules_event_active ON public.communication_rules(event_name, is_active);
ALTER TABLE public.communication_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage communication rules" ON public.communication_rules
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_communication_rules_updated_at
  BEFORE UPDATE ON public.communication_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- communication_templates
CREATE TABLE public.communication_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key text NOT NULL UNIQUE,
  name text NOT NULL,
  channel text NOT NULL,
  provider_key text NOT NULL,
  market text,
  language text,
  external_template_name text,
  variables_json jsonb,
  preview_text text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.communication_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage communication templates" ON public.communication_templates
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_communication_templates_updated_at
  BEFORE UPDATE ON public.communication_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- communication_deliveries
CREATE TABLE public.communication_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  inspection_id uuid REFERENCES public.inspections(id) ON DELETE SET NULL,
  rule_id uuid REFERENCES public.communication_rules(id) ON DELETE SET NULL,
  channel text NOT NULL,
  provider_key text NOT NULL,
  recipient_type text NOT NULL,
  recipient_value text,
  template_key text,
  request_payload_json jsonb,
  response_payload_json jsonb,
  status text NOT NULL,
  error_message text,
  provider_message_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX idx_communication_deliveries_inspection ON public.communication_deliveries(inspection_id);
CREATE INDEX idx_communication_deliveries_event ON public.communication_deliveries(event_name);
CREATE INDEX idx_communication_deliveries_status ON public.communication_deliveries(status);
CREATE INDEX idx_communication_deliveries_created ON public.communication_deliveries(created_at DESC);
ALTER TABLE public.communication_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage all deliveries" ON public.communication_deliveries
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Executives can view deliveries of assigned inspections" ON public.communication_deliveries
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.inspections i WHERE i.id = communication_deliveries.inspection_id AND i.executive_id = auth.uid())
  );
