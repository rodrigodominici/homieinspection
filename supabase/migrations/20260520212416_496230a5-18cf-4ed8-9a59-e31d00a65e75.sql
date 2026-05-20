CREATE POLICY "Executives can view staff profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'executive')
  AND role IN ('inspector', 'executive', 'admin')
);