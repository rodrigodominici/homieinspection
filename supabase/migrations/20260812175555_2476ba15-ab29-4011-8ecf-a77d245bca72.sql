ALTER TABLE public.client_error_log
  ADD COLUMN IF NOT EXISTS route text,
  ADD COLUMN IF NOT EXISTS role text,
  ADD COLUMN IF NOT EXISTS app_version text,
  ADD COLUMN IF NOT EXISTS event_kind text,
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS context jsonb;

CREATE INDEX IF NOT EXISTS idx_client_error_log_created_at ON public.client_error_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_error_log_kind_created ON public.client_error_log (error_kind, created_at DESC);

GRANT SELECT, INSERT ON public.client_error_log TO authenticated;
GRANT INSERT ON public.client_error_log TO anon;
GRANT ALL ON public.client_error_log TO service_role;