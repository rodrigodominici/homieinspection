
-- ============================================================================
-- CANONICAL CLEANUP MIGRATION
-- ============================================================================
-- 1. Drops deprecated `typology` columns (property_type is the sole source of truth).
-- 2. Flips `inspection-photos` bucket to private.
-- 3. Adds storage.objects RLS for inspector/executive/admin paths.
-- 4. Replaces get_published_report:
--      - VOLATILE (signs URLs per call)
--      - Auth gate: public_token + property_id (unchanged)
--      - Walks normalized_payload.sections[].photos[] and replaces each photo's
--        `url` with a fresh signed URL (1h TTL) derived from the matching
--        inspection_photos.storage_path.
--      - Missing/unsignable objects yield url = null (renderer tolerates it).
-- ============================================================================

-- 1. Drop typology
ALTER TABLE public.inspections DROP COLUMN IF EXISTS typology;
ALTER TABLE public.inspection_templates DROP COLUMN IF EXISTS typology;

-- 2. Make bucket private
UPDATE storage.buckets SET public = false WHERE id = 'inspection-photos';

-- 3. Storage RLS — drop any existing policies on inspection-photos first
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname LIKE 'inspection_photos_%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END$$;

-- Admins: full access
CREATE POLICY inspection_photos_admin_all ON storage.objects
FOR ALL TO authenticated
USING (bucket_id = 'inspection-photos' AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (bucket_id = 'inspection-photos' AND public.has_role(auth.uid(), 'admin'));

-- Inspectors: read/insert/delete own assigned inspection objects
-- Path convention: inspections/{inspection_id}/{section_key}/{uuid}.{ext}
CREATE POLICY inspection_photos_inspector_select ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'inspection-photos'
  AND EXISTS (
    SELECT 1 FROM public.inspections i
    WHERE i.inspector_id = auth.uid()
      AND name LIKE 'inspections/' || i.id::text || '/%'
  )
);

CREATE POLICY inspection_photos_inspector_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'inspection-photos'
  AND EXISTS (
    SELECT 1 FROM public.inspections i
    WHERE i.inspector_id = auth.uid()
      AND name LIKE 'inspections/' || i.id::text || '/%'
  )
);

CREATE POLICY inspection_photos_inspector_delete ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'inspection-photos'
  AND EXISTS (
    SELECT 1 FROM public.inspections i
    WHERE i.inspector_id = auth.uid()
      AND name LIKE 'inspections/' || i.id::text || '/%'
  )
);

-- Executives: read assigned inspection objects
CREATE POLICY inspection_photos_executive_select ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'inspection-photos'
  AND EXISTS (
    SELECT 1 FROM public.inspections i
    WHERE i.executive_id = auth.uid()
      AND name LIKE 'inspections/' || i.id::text || '/%'
  )
);

-- 4. Replace get_published_report with VOLATILE signed-URL version
CREATE OR REPLACE FUNCTION public.get_published_report(p_property_id text, p_token text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  v_inspection_id uuid;
  v_sections jsonb;
  v_section jsonb;
  v_photos jsonb;
  v_photo jsonb;
  v_new_photos jsonb;
  v_new_sections jsonb := '[]'::jsonb;
  v_storage_path text;
  v_signed_url text;
  i int;
  j int;
BEGIN
  -- Auth gate: token + property_id
  SELECT irv.normalized_payload, irv.inspection_id
    INTO result, v_inspection_id
  FROM inspection_report_versions irv
  JOIN inspections i ON i.id = irv.inspection_id
  WHERE irv.public_token = p_token
    AND i.property_id = p_property_id
    AND irv.status = 'published'
    AND irv.is_latest = true;

  IF result IS NULL THEN
    RETURN NULL;
  END IF;

  v_sections := result -> 'sections';
  IF v_sections IS NULL OR jsonb_typeof(v_sections) <> 'array' THEN
    RETURN result;
  END IF;

  -- Walk sections → photos, replace url with signed url from storage_path
  FOR i IN 0 .. jsonb_array_length(v_sections) - 1 LOOP
    v_section := v_sections -> i;
    v_photos := v_section -> 'photos';
    v_new_photos := '[]'::jsonb;

    IF v_photos IS NOT NULL AND jsonb_typeof(v_photos) = 'array' THEN
      FOR j IN 0 .. jsonb_array_length(v_photos) - 1 LOOP
        v_photo := v_photos -> j;
        v_storage_path := NULL;
        v_signed_url := NULL;

        -- Look up canonical storage_path by photo id
        SELECT ip.storage_path INTO v_storage_path
        FROM inspection_photos ip
        WHERE ip.id = (v_photo ->> 'id')::uuid
          AND ip.inspection_id = v_inspection_id;

        IF v_storage_path IS NOT NULL THEN
          BEGIN
            -- Sign URL valid for 1 hour
            SELECT (storage.sign(v_storage_path, 3600, 'inspection-photos')) INTO v_signed_url;
          EXCEPTION WHEN OTHERS THEN
            v_signed_url := NULL;
          END;
        END IF;

        v_new_photos := v_new_photos || jsonb_build_object(
          'id', v_photo -> 'id',
          'url', to_jsonb(v_signed_url),
          'caption', v_photo -> 'caption'
        );
      END LOOP;
    END IF;

    v_new_sections := v_new_sections || (v_section || jsonb_build_object('photos', v_new_photos));
  END LOOP;

  result := result || jsonb_build_object('sections', v_new_sections);
  RETURN result;
END;
$function$;
