-- 1. Add audience column with safe default for legacy rows
ALTER TABLE public.inspection_report_versions
  ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'owner';

ALTER TABLE public.inspection_report_versions
  DROP CONSTRAINT IF EXISTS inspection_report_versions_audience_check;

ALTER TABLE public.inspection_report_versions
  ADD CONSTRAINT inspection_report_versions_audience_check
  CHECK (audience IN ('owner', 'tenant'));

-- 2. Indexes: lookup + uniqueness of latest per audience
CREATE INDEX IF NOT EXISTS inspection_report_versions_audience_idx
  ON public.inspection_report_versions (inspection_id, audience, is_latest);

CREATE UNIQUE INDEX IF NOT EXISTS inspection_report_versions_latest_unique
  ON public.inspection_report_versions (inspection_id, audience)
  WHERE is_latest = true;

-- 3. Update get_published_report to return audience field
CREATE OR REPLACE FUNCTION public.get_published_report(p_property_id text, p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  v_inspection_id uuid;
  v_audience text;
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
  SELECT irv.normalized_payload, irv.inspection_id, irv.audience
    INTO result, v_inspection_id, v_audience
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
    RETURN result || jsonb_build_object('audience', COALESCE(v_audience, 'owner'));
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

        SELECT ip.storage_path INTO v_storage_path
        FROM inspection_photos ip
        WHERE ip.id = (v_photo ->> 'id')::uuid
          AND ip.inspection_id = v_inspection_id;

        IF v_storage_path IS NOT NULL THEN
          BEGIN
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

  result := result || jsonb_build_object(
    'sections', v_new_sections,
    'audience', COALESCE(v_audience, 'owner')
  );
  RETURN result;
END;
$function$;