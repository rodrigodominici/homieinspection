CREATE POLICY "Inspectors can read audit log of own inspections"
ON public.inspection_audit_log
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.inspections i
    WHERE i.id = inspection_audit_log.inspection_id
      AND i.inspector_id = auth.uid()
  )
);