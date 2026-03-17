
CREATE TABLE public.external_user_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'hubspot',
  hubspot_user_id text,
  hubspot_email text,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  role_hint text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_external_user_mappings_provider_email 
  ON public.external_user_mappings (provider, hubspot_email) 
  WHERE hubspot_email IS NOT NULL;

ALTER TABLE public.external_user_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all mappings"
  ON public.external_user_mappings FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_external_user_mappings_updated_at
  BEFORE UPDATE ON public.external_user_mappings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
