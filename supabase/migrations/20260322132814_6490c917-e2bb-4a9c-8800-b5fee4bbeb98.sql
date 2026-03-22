
CREATE TABLE public.inspection_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  previous_status text,
  new_status text,
  action text NOT NULL,
  performed_by uuid REFERENCES profiles(id),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.inspection_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage audit log"
  ON public.inspection_audit_log
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'));
