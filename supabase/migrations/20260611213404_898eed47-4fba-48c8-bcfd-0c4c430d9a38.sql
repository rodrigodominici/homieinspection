
CREATE TABLE public.slack_notifications_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  slack_channel text,
  slack_message_ts text,
  recipient_email text,
  recipient_slack_user_id text,
  status text NOT NULL DEFAULT 'sent',
  error_message text,
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX slack_notifications_log_unique_event
  ON public.slack_notifications_log(inspection_id, event_type)
  WHERE status = 'sent';

CREATE INDEX slack_notifications_log_inspection_idx
  ON public.slack_notifications_log(inspection_id);

GRANT ALL ON public.slack_notifications_log TO service_role;

ALTER TABLE public.slack_notifications_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role manages slack log"
  ON public.slack_notifications_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
