ALTER TABLE public.inspection_photos DROP CONSTRAINT IF EXISTS inspection_photos_photo_stage_check;
ALTER TABLE public.inspection_photos ADD CONSTRAINT inspection_photos_photo_stage_check
  CHECK (photo_stage IS NULL OR photo_stage = ANY (ARRAY['before','after','marketing']));

CREATE OR REPLACE FUNCTION public.tag_marketing_photo()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.inspection_sections s
             WHERE s.id = NEW.inspection_section_id AND s.section_key = 'marketing_photos') THEN
    NEW.photo_stage := 'marketing';
    NEW.visible_to_owner := false;
    NEW.field_key := COALESCE(NEW.field_key, 'marketing_photos');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_tag_marketing_photo ON public.inspection_photos;
CREATE TRIGGER trg_tag_marketing_photo BEFORE INSERT ON public.inspection_photos
FOR EACH ROW EXECUTE FUNCTION public.tag_marketing_photo();

CREATE INDEX IF NOT EXISTS idx_inspection_photos_marketing
  ON public.inspection_photos (inspection_id, sort_order) WHERE photo_stage = 'marketing';