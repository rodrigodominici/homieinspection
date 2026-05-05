CREATE TABLE public.market_tax_settings (
  market text PRIMARY KEY,
  vat_enabled boolean NOT NULL DEFAULT true,
  vat_percentage numeric(5,2) NOT NULL DEFAULT 0,
  vat_label text NOT NULL DEFAULT 'IVA',
  currency text NOT NULL DEFAULT 'CLP',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.market_tax_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage market tax settings"
  ON public.market_tax_settings FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated read market tax settings"
  ON public.market_tax_settings FOR SELECT TO authenticated
  USING (true);

CREATE TRIGGER trg_market_tax_settings_updated
  BEFORE UPDATE ON public.market_tax_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.market_tax_settings (market, vat_enabled, vat_percentage, vat_label, currency)
VALUES
  ('CL', true, 19, 'IVA', 'CLP'),
  ('MX', true, 16, 'IVA', 'MXN')
ON CONFLICT (market) DO NOTHING;