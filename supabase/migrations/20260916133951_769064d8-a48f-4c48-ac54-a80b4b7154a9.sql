GRANT INSERT ON public.client_error_log TO anon;

CREATE POLICY "Anon can insert anonymous error logs"
  ON public.client_error_log FOR INSERT
  TO anon
  WITH CHECK (user_id IS NULL);