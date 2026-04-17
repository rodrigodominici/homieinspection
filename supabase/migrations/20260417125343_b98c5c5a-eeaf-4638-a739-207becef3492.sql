
-- ============================================================================
-- QA DATA WIPE — clears inspection-domain rows in dependency order
-- Preserves: profiles, mappings, repair catalog, contractors, templates
-- Storage objects: cleaned separately via scripts/qa-storage-wipe.ts
-- ============================================================================

DELETE FROM public.inspection_audit_log;
DELETE FROM public.inspection_repair_items;
DELETE FROM public.inspection_report_versions;
DELETE FROM public.inspection_reviews;
DELETE FROM public.inspection_signatures;
DELETE FROM public.inspection_field_values;
DELETE FROM public.inspection_photos;
DELETE FROM public.inspection_sections;
DELETE FROM public.inspections;
DELETE FROM public.inspection_source_events;
