INSERT INTO public.inspection_field_values (
  inspection_id, inspection_section_id, field_key, field_label, field_type,
  group_key, sort_order, is_visible
)
SELECT i.id, sec.id, f ->> 'field_key', f ->> 'field_label', f ->> 'field_type',
       NULLIF(f ->> 'group_key', ''), COALESCE((f ->> 'sort_order')::int, 0), true
FROM public.inspections i
JOIN jsonb_array_elements(i.generated_structure_json -> 'sections') s ON true
JOIN public.inspection_sections sec
  ON sec.inspection_id = i.id AND sec.section_key = s ->> 'section_key'
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s -> 'fields', '[]'::jsonb)) AS f
WHERE i.id = '931958ae-d41c-41a4-9cb0-fe6d25c4d92c'
  AND NOT EXISTS (
    SELECT 1 FROM public.inspection_field_values fv
    WHERE fv.inspection_section_id = sec.id AND fv.field_key = f ->> 'field_key'
  );