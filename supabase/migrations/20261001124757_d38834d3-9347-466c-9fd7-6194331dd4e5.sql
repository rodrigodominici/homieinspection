CREATE TABLE public.market_realty_api_settings (
  market text PRIMARY KEY,
  base_url text NOT NULL,
  business_unit text,
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE ON public.market_realty_api_settings TO authenticated;
GRANT ALL ON public.market_realty_api_settings TO service_role;
ALTER TABLE public.market_realty_api_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage realty api settings" ON public.market_realty_api_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_market_realty_api_settings_updated BEFORE UPDATE ON public.market_realty_api_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
INSERT INTO public.market_realty_api_settings (market, base_url, business_unit, is_active) VALUES
  ('CL', 'https://api.homierent.com/real-estate/realties/reference-id', 'HOMIERENT_CHILE', true),
  ('MX', 'https://api.homierent.com/real-estate/realties/reference-id', 'HOMIE_MEXICO', false),
  ('PE', 'https://api.homierent.com/real-estate/realties/reference-id', 'HOMIE_PERU', false);