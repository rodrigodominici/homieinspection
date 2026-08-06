CREATE INDEX IF NOT EXISTS idx_profiles_role_active ON public.profiles (role, is_active);
CREATE INDEX IF NOT EXISTS idx_inspection_reviews_inspection_id ON public.inspection_reviews (inspection_id);
CREATE INDEX IF NOT EXISTS idx_inspection_field_values_inspection_id ON public.inspection_field_values (inspection_id);
CREATE INDEX IF NOT EXISTS idx_inspection_repair_items_inspection_id ON public.inspection_repair_items (inspection_id);
CREATE INDEX IF NOT EXISTS idx_inspection_photos_inspection_id ON public.inspection_photos (inspection_id);