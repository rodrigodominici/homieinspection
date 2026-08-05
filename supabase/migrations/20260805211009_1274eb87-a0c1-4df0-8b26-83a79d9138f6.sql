CREATE TABLE public.system_health_state (
  id text PRIMARY KEY DEFAULT 'singleton',
  status text NOT NULL DEFAULT 'ok',
  detail text,
  since timestamptz NOT NULL DEFAULT now(),
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  last_notified_at timestamptz,
  CONSTRAINT system_health_state_singleton CHECK (id = 'singleton'),
  CONSTRAINT system_health_state_status_chk CHECK (status IN ('ok','down'))
);

GRANT ALL ON public.system_health_state TO service_role;

ALTER TABLE public.system_health_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view system health"
ON public.system_health_state
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.system_health_state (id) VALUES ('singleton') ON CONFLICT DO NOTHING;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;