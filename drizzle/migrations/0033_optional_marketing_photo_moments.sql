ALTER TABLE public.inspection_photos DROP CONSTRAINT inspection_photos_photo_stage_check;
ALTER TABLE public.inspection_photos ADD CONSTRAINT inspection_photos_photo_stage_check
  CHECK (photo_stage IS NULL OR photo_stage = ANY (ARRAY['before','after','marketing','marketing_work']));

CREATE OR REPLACE FUNCTION public.tag_marketing_photo()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.photo_stage = 'marketing_work' THEN
    NEW.visible_to_owner := false;
    NEW.work_order_item_id := NULL;
    NEW.field_key := COALESCE(NEW.field_key, 'marketing_work_photos');
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.inspection_sections s
             WHERE s.id = NEW.inspection_section_id
               AND s.section_key IN ('marketing_photos','marketing_photos_checkin')) THEN
    NEW.photo_stage := 'marketing';
    NEW.visible_to_owner := false;
    NEW.field_key := COALESCE(NEW.field_key, 'marketing_photos');
  END IF;
  RETURN NEW;
END $$;