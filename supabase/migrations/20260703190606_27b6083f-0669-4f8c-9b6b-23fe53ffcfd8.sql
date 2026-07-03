CREATE TABLE public.client_error_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  inspection_id UUID,
  section_key TEXT,
  error_kind TEXT NOT NULL,
  message TEXT,
  status_code INT,
  context JSONB,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT INSERT ON public.client_error_log TO authenticated;
GRANT ALL ON public.client_error_log TO service_role;
GRANT SELECT ON public.client_error_log TO authenticated;

ALTER TABLE public.client_error_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own error logs"
  ON public.client_error_log FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Admins can read error logs"
  ON public.client_error_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_client_error_log_inspection ON public.client_error_log(inspection_id, created_at DESC);
CREATE INDEX idx_client_error_log_created ON public.client_error_log(created_at DESC);