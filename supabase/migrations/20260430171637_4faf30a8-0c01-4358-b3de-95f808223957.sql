ALTER TABLE public.hubspot_sync_log
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retry_attempts_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS retried_to_log_id uuid NULL,
  ADD COLUMN IF NOT EXISTS retried_from_log_id uuid NULL;

CREATE INDEX IF NOT EXISTS hubspot_sync_log_retried_from_idx
  ON public.hubspot_sync_log (retried_from_log_id)
  WHERE retried_from_log_id IS NOT NULL;