UPDATE public.inspection_sections s
SET status = 'not_started'
WHERE s.status = 'completed'
  AND NOT EXISTS (
    SELECT 1 FROM public.inspection_field_values f
    WHERE f.inspection_section_id = s.id
      AND (COALESCE(f.value_text,'') <> '' OR f.value_json IS NOT NULL)
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.inspection_photos p WHERE p.inspection_section_id = s.id
  )
  AND EXISTS (
    SELECT 1 FROM public.inspections i
    WHERE i.id = s.inspection_id
      AND i.status IN ('pending_assignment','assigned','in_progress')
  );