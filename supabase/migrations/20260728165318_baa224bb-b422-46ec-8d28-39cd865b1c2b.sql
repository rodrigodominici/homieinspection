
-- 1) Extend allowed roles to include 'comercial' (and formalize 'pending')
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['admin','inspector','executive','comercial','pending']));

-- 2) Read-only helper: is a given inspection a submitted check-out?
CREATE OR REPLACE FUNCTION public.is_visible_checkout_for_comercial(_inspection_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.inspections i
    WHERE i.id = _inspection_id
      AND i.inspection_type = 'check_out'
      AND i.status IN ('submitted','in_review','approved','published','accepted')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_visible_checkout_for_comercial(uuid) TO authenticated;

-- 3) SELECT policies for role 'comercial'
-- Inspections: only submitted+ check-outs
DROP POLICY IF EXISTS "Comercial can view submitted check-outs" ON public.inspections;
CREATE POLICY "Comercial can view submitted check-outs"
  ON public.inspections
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'comercial')
    AND inspection_type = 'check_out'
    AND status IN ('submitted','in_review','approved','published','accepted')
  );

-- Sections
DROP POLICY IF EXISTS "Comercial can view sections of visible check-outs" ON public.inspection_sections;
CREATE POLICY "Comercial can view sections of visible check-outs"
  ON public.inspection_sections
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'comercial')
    AND public.is_visible_checkout_for_comercial(inspection_id)
  );

-- Field values
DROP POLICY IF EXISTS "Comercial can view field values of visible check-outs" ON public.inspection_field_values;
CREATE POLICY "Comercial can view field values of visible check-outs"
  ON public.inspection_field_values
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'comercial')
    AND public.is_visible_checkout_for_comercial(inspection_id)
  );

-- Photos
DROP POLICY IF EXISTS "Comercial can view photos of visible check-outs" ON public.inspection_photos;
CREATE POLICY "Comercial can view photos of visible check-outs"
  ON public.inspection_photos
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'comercial')
    AND public.is_visible_checkout_for_comercial(inspection_id)
  );

-- Signatures
DROP POLICY IF EXISTS "Comercial can view signatures of visible check-outs" ON public.inspection_signatures;
CREATE POLICY "Comercial can view signatures of visible check-outs"
  ON public.inspection_signatures
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'comercial')
    AND public.is_visible_checkout_for_comercial(inspection_id)
  );

-- Profiles: comercial can read basic identity of any profile (needed to show
-- assigned executive/inspector on lists and detail). Profiles table already has
-- restrictive policies; we add a permissive SELECT for comercial.
DROP POLICY IF EXISTS "Comercial can view basic profiles" ON public.profiles;
CREATE POLICY "Comercial can view basic profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING ( public.has_role(auth.uid(), 'comercial') );

-- 4) Storage: allow signed URL creation for comercial on inspection-photos
-- Signed URLs are minted server-side via createSignedUrl, which requires
-- SELECT on storage.objects. We add a SELECT policy scoped to visible check-outs
-- by matching the storage_path against inspection_photos rows the user can see.
DROP POLICY IF EXISTS "Comercial can read photos of visible check-outs" ON storage.objects;
CREATE POLICY "Comercial can read photos of visible check-outs"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'inspection-photos'
    AND public.has_role(auth.uid(), 'comercial')
    AND EXISTS (
      SELECT 1 FROM public.inspection_photos p
      WHERE p.storage_path = storage.objects.name
        AND public.is_visible_checkout_for_comercial(p.inspection_id)
    )
  );
