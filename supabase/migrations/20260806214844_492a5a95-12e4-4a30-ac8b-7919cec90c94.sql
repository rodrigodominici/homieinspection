CREATE INDEX IF NOT EXISTS idx_profiles_role_active ON public.profiles (role, is_active);

-- inspections
DROP POLICY IF EXISTS "Admins can manage all inspections" ON public.inspections;
CREATE POLICY "Admins can manage all inspections" ON public.inspections FOR ALL TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'));
DROP POLICY IF EXISTS "Executives can update assigned inspections" ON public.inspections;
CREATE POLICY "Executives can update assigned inspections" ON public.inspections FOR UPDATE TO authenticated
  USING (executive_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "Executives can view assigned inspections" ON public.inspections;
CREATE POLICY "Executives can view assigned inspections" ON public.inspections FOR SELECT TO authenticated
  USING (executive_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "Inspectors can update assigned inspections" ON public.inspections;
CREATE POLICY "Inspectors can update assigned inspections" ON public.inspections FOR UPDATE TO authenticated
  USING (inspector_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "Inspectors can view assigned inspections" ON public.inspections;
CREATE POLICY "Inspectors can view assigned inspections" ON public.inspections FOR SELECT TO authenticated
  USING (inspector_id = (SELECT auth.uid()));

-- inspection_sections
DROP POLICY IF EXISTS "Admins can manage all sections" ON public.inspection_sections;
CREATE POLICY "Admins can manage all sections" ON public.inspection_sections FOR ALL TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'));
DROP POLICY IF EXISTS "Executives can update sections of assigned inspections" ON public.inspection_sections;
CREATE POLICY "Executives can update sections of assigned inspections" ON public.inspection_sections FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.inspections i WHERE i.id = inspection_sections.inspection_id AND i.executive_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "Executives can view sections of assigned inspections" ON public.inspection_sections;
CREATE POLICY "Executives can view sections of assigned inspections" ON public.inspection_sections FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.inspections i WHERE i.id = inspection_sections.inspection_id AND i.executive_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "Inspectors can update sections of assigned inspections" ON public.inspection_sections;
CREATE POLICY "Inspectors can update sections of assigned inspections" ON public.inspection_sections FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.inspections i WHERE i.id = inspection_sections.inspection_id AND i.inspector_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "Inspectors can view sections of assigned inspections" ON public.inspection_sections;
CREATE POLICY "Inspectors can view sections of assigned inspections" ON public.inspection_sections FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.inspections i WHERE i.id = inspection_sections.inspection_id AND i.inspector_id = (SELECT auth.uid())));

-- inspection_field_values
DROP POLICY IF EXISTS "Admins can manage all field values" ON public.inspection_field_values;
CREATE POLICY "Admins can manage all field values" ON public.inspection_field_values FOR ALL TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'));
DROP POLICY IF EXISTS "Executives can update field values of assigned inspections" ON public.inspection_field_values;
CREATE POLICY "Executives can update field values of assigned inspections" ON public.inspection_field_values FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.inspections i WHERE i.id = inspection_field_values.inspection_id AND i.executive_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "Executives can view field values of assigned inspections" ON public.inspection_field_values;
CREATE POLICY "Executives can view field values of assigned inspections" ON public.inspection_field_values FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.inspections i WHERE i.id = inspection_field_values.inspection_id AND i.executive_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "Inspectors can update field values of assigned inspections" ON public.inspection_field_values;
CREATE POLICY "Inspectors can update field values of assigned inspections" ON public.inspection_field_values FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.inspections i WHERE i.id = inspection_field_values.inspection_id AND i.inspector_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "Inspectors can view field values of assigned inspections" ON public.inspection_field_values;
CREATE POLICY "Inspectors can view field values of assigned inspections" ON public.inspection_field_values FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.inspections i WHERE i.id = inspection_field_values.inspection_id AND i.inspector_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "Inspectors can upsert field values of assigned inspections" ON public.inspection_field_values;
CREATE POLICY "Inspectors can upsert field values of assigned inspections" ON public.inspection_field_values FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.inspections i WHERE i.id = inspection_field_values.inspection_id AND i.inspector_id = (SELECT auth.uid())));

-- inspection_photos
DROP POLICY IF EXISTS "Admins can manage all photos" ON public.inspection_photos;
CREATE POLICY "Admins can manage all photos" ON public.inspection_photos FOR ALL TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'));
DROP POLICY IF EXISTS "Executives can delete photos of assigned inspections" ON public.inspection_photos;
CREATE POLICY "Executives can delete photos of assigned inspections" ON public.inspection_photos FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.inspections i WHERE i.id = inspection_photos.inspection_id AND i.executive_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "Executives can insert photos for assigned inspections" ON public.inspection_photos;
CREATE POLICY "Executives can insert photos for assigned inspections" ON public.inspection_photos FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.inspections i WHERE i.id = inspection_photos.inspection_id AND i.executive_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "Executives can update photos of assigned inspections" ON public.inspection_photos;
CREATE POLICY "Executives can update photos of assigned inspections" ON public.inspection_photos FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.inspections i WHERE i.id = inspection_photos.inspection_id AND i.executive_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "Executives can view photos of assigned inspections" ON public.inspection_photos;
CREATE POLICY "Executives can view photos of assigned inspections" ON public.inspection_photos FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.inspections i WHERE i.id = inspection_photos.inspection_id AND i.executive_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "Inspectors can delete photos from assigned inspections" ON public.inspection_photos;
CREATE POLICY "Inspectors can delete photos from assigned inspections" ON public.inspection_photos FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.inspections i WHERE i.id = inspection_photos.inspection_id AND i.inspector_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "Inspectors can insert photos for assigned inspections" ON public.inspection_photos;
CREATE POLICY "Inspectors can insert photos for assigned inspections" ON public.inspection_photos FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.inspections i WHERE i.id = inspection_photos.inspection_id AND i.inspector_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "Inspectors can view photos of assigned inspections" ON public.inspection_photos;
CREATE POLICY "Inspectors can view photos of assigned inspections" ON public.inspection_photos FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.inspections i WHERE i.id = inspection_photos.inspection_id AND i.inspector_id = (SELECT auth.uid())));

-- inspection_reviews
DROP POLICY IF EXISTS "Admins can manage all reviews" ON public.inspection_reviews;
CREATE POLICY "Admins can manage all reviews" ON public.inspection_reviews FOR ALL TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'));
DROP POLICY IF EXISTS "Executives can create reviews for assigned inspections" ON public.inspection_reviews;
CREATE POLICY "Executives can create reviews for assigned inspections" ON public.inspection_reviews FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.inspections i WHERE i.id = inspection_reviews.inspection_id AND i.executive_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "Executives can view reviews of assigned inspections" ON public.inspection_reviews;
CREATE POLICY "Executives can view reviews of assigned inspections" ON public.inspection_reviews FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.inspections i WHERE i.id = inspection_reviews.inspection_id AND i.executive_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "Inspectors can view reviews of assigned inspections" ON public.inspection_reviews;
CREATE POLICY "Inspectors can view reviews of assigned inspections" ON public.inspection_reviews FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.inspections i WHERE i.id = inspection_reviews.inspection_id AND i.inspector_id = (SELECT auth.uid())));

-- inspection_repair_items
DROP POLICY IF EXISTS "Admins can manage all repair items" ON public.inspection_repair_items;
CREATE POLICY "Admins can manage all repair items" ON public.inspection_repair_items FOR ALL TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'));
DROP POLICY IF EXISTS "Executives can manage repair items of assigned inspections" ON public.inspection_repair_items;
CREATE POLICY "Executives can manage repair items of assigned inspections" ON public.inspection_repair_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.inspections i WHERE i.id = inspection_repair_items.inspection_id AND i.executive_id = (SELECT auth.uid())));