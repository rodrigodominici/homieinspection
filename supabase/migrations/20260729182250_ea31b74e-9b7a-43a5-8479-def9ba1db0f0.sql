-- 1) Missing index used by the comercial storage policy
CREATE INDEX IF NOT EXISTS idx_inspection_photos_storage_path
  ON public.inspection_photos (storage_path);

-- 2) Cheap, initplan-friendly role check for comercial
CREATE OR REPLACE FUNCTION public.is_comercial()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'comercial' AND is_active = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_comercial() TO authenticated;

-- 3) Rewrite comercial policies: TO authenticated + subselect-wrapped role check

DROP POLICY IF EXISTS "Comercial can view submitted inspections" ON public.inspections;
CREATE POLICY "Comercial can view submitted inspections"
  ON public.inspections
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.is_comercial())
    AND inspection_type IN ('check_out','captacion')
    AND status IN ('submitted','in_review','approved','published','accepted','sent')
  );

DROP POLICY IF EXISTS "Comercial can view sections of visible check-outs" ON public.inspection_sections;
CREATE POLICY "Comercial can view sections of visible check-outs"
  ON public.inspection_sections
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.is_comercial())
    AND public.is_visible_checkout_for_comercial(inspection_id)
  );

DROP POLICY IF EXISTS "Comercial can view field values of visible check-outs" ON public.inspection_field_values;
CREATE POLICY "Comercial can view field values of visible check-outs"
  ON public.inspection_field_values
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.is_comercial())
    AND public.is_visible_checkout_for_comercial(inspection_id)
  );

DROP POLICY IF EXISTS "Comercial can view photos of visible check-outs" ON public.inspection_photos;
CREATE POLICY "Comercial can view photos of visible check-outs"
  ON public.inspection_photos
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.is_comercial())
    AND public.is_visible_checkout_for_comercial(inspection_id)
  );

DROP POLICY IF EXISTS "Comercial can view signatures of visible check-outs" ON public.inspection_signatures;
CREATE POLICY "Comercial can view signatures of visible check-outs"
  ON public.inspection_signatures
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.is_comercial())
    AND public.is_visible_checkout_for_comercial(inspection_id)
  );

DROP POLICY IF EXISTS "Comercial can view basic profiles" ON public.profiles;
CREATE POLICY "Comercial can view basic profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.is_comercial())
    AND role IN ('inspector','executive','admin','comercial')
  );

-- 4) Storage: role check short-circuits before the (now indexed) path lookup
DROP POLICY IF EXISTS "Comercial can read photos of visible check-outs" ON storage.objects;
CREATE POLICY "Comercial can read photos of visible check-outs"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'inspection-photos'
    AND (SELECT public.is_comercial())
    AND EXISTS (
      SELECT 1 FROM public.inspection_photos p
      WHERE p.storage_path = storage.objects.name
        AND public.is_visible_checkout_for_comercial(p.inspection_id)
    )
  );