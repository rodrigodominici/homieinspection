
-- =====================================================
-- HOMIE INSPECTION MVP — Full Schema Migration
-- =====================================================

-- 1. Profiles table (linked to auth.users)
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'inspector', 'executive')),
  is_active boolean NOT NULL DEFAULT true,
  market text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2. has_role() security definer function
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id AND role = _role AND is_active = true
  );
$$;

-- 3. get_user_role() helper
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = _user_id AND is_active = true;
$$;

-- 4. Auto-create profile trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'role', 'inspector')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 6. inspection_source_events
CREATE TABLE public.inspection_source_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'manual',
  hubspot_event_id text,
  hubspot_property_id text,
  payload_json jsonb NOT NULL,
  processing_status text NOT NULL DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
  error_message text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

ALTER TABLE public.inspection_source_events ENABLE ROW LEVEL SECURITY;

-- 7. inspection_templates
CREATE TABLE public.inspection_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  market text NOT NULL,
  typology text,
  property_type text,
  inspection_type text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.inspection_templates ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_inspection_templates_updated_at
  BEFORE UPDATE ON public.inspection_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 8. inspection_template_sections
CREATE TABLE public.inspection_template_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.inspection_templates(id) ON DELETE CASCADE,
  section_key text NOT NULL,
  section_title text NOT NULL,
  section_type text NOT NULL CHECK (section_type IN ('property_meta', 'handover_meta', 'admin_meta', 'space_standard', 'space_secondary', 'space_technical', 'closing_summary')),
  sort_order integer NOT NULL,
  is_repeatable boolean NOT NULL DEFAULT false,
  visibility_rules jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.inspection_template_sections ENABLE ROW LEVEL SECURITY;

-- 9. inspection_template_fields
CREATE TABLE public.inspection_template_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_section_id uuid NOT NULL REFERENCES public.inspection_template_sections(id) ON DELETE CASCADE,
  field_key text NOT NULL,
  field_label text NOT NULL,
  field_type text NOT NULL CHECK (field_type IN ('text', 'textarea', 'number', 'boolean', 'single_select', 'multi_select', 'photo_upload', 'date', 'email', 'phone')),
  required boolean NOT NULL DEFAULT false,
  options_json jsonb,
  sort_order integer NOT NULL,
  default_value text,
  help_text text,
  group_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.inspection_template_fields ENABLE ROW LEVEL SECURITY;

-- 10. inspections
CREATE TABLE public.inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_event_id uuid REFERENCES public.inspection_source_events(id) ON DELETE SET NULL,
  template_id uuid REFERENCES public.inspection_templates(id) ON DELETE SET NULL,
  hubspot_property_id text,
  property_id text NOT NULL,
  market text NOT NULL,
  property_name text,
  address text,
  typology text,
  property_type text,
  inspection_type text NOT NULL,
  inspector_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  executive_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'in_progress', 'submitted', 'in_review', 'needs_changes', 'approved', 'published', 'sent')),
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  approved_at timestamptz,
  property_snapshot_json jsonb NOT NULL,
  generated_structure_json jsonb,
  last_active_section_id uuid,
  last_active_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  submitted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_inspections_updated_at
  BEFORE UPDATE ON public.inspections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 11. inspection_sections
CREATE TABLE public.inspection_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,
  template_section_id uuid REFERENCES public.inspection_template_sections(id) ON DELETE SET NULL,
  section_key text NOT NULL,
  section_title text NOT NULL,
  section_type text NOT NULL,
  sort_order integer NOT NULL,
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed', 'needs_changes', 'reviewed')),
  is_visible boolean NOT NULL DEFAULT true,
  final_observation text,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.inspection_sections ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_inspection_sections_updated_at
  BEFORE UPDATE ON public.inspection_sections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add FK from inspections.last_active_section_id now that inspection_sections exists
ALTER TABLE public.inspections
  ADD CONSTRAINT fk_last_active_section
  FOREIGN KEY (last_active_section_id) REFERENCES public.inspection_sections(id) ON DELETE SET NULL;

-- 12. inspection_field_values
CREATE TABLE public.inspection_field_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,
  inspection_section_id uuid NOT NULL REFERENCES public.inspection_sections(id) ON DELETE CASCADE,
  field_key text NOT NULL,
  field_label text NOT NULL,
  field_type text NOT NULL,
  group_key text,
  value_text text,
  value_json jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  is_visible boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.inspection_field_values ENABLE ROW LEVEL SECURITY;

-- 13. inspection_photos
CREATE TABLE public.inspection_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,
  inspection_section_id uuid NOT NULL REFERENCES public.inspection_sections(id) ON DELETE CASCADE,
  field_key text,
  group_key text,
  storage_bucket text NOT NULL DEFAULT 'inspection-photos',
  storage_path text NOT NULL,
  public_url text,
  caption text,
  sort_order integer NOT NULL DEFAULT 0,
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.inspection_photos ENABLE ROW LEVEL SECURITY;

-- 14. inspection_reviews
CREATE TABLE public.inspection_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,
  inspection_section_id uuid NOT NULL REFERENCES public.inspection_sections(id) ON DELETE CASCADE,
  comment_type text NOT NULL CHECK (comment_type IN ('internal_note', 'revision_request', 'final_observation')),
  comment text NOT NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.inspection_reviews ENABLE ROW LEVEL SECURITY;

-- 15. inspection_report_versions (placeholder for future)
CREATE TABLE public.inspection_report_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  status text NOT NULL,
  normalized_payload jsonb NOT NULL,
  public_token text,
  published_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.inspection_report_versions ENABLE ROW LEVEL SECURITY;

-- 16. Indexes
CREATE INDEX idx_inspections_inspector ON public.inspections(inspector_id);
CREATE INDEX idx_inspections_executive ON public.inspections(executive_id);
CREATE INDEX idx_inspections_status ON public.inspections(status);
CREATE INDEX idx_inspection_sections_inspection ON public.inspection_sections(inspection_id);
CREATE INDEX idx_inspection_field_values_section ON public.inspection_field_values(inspection_section_id);
CREATE INDEX idx_inspection_photos_section ON public.inspection_photos(inspection_section_id);
CREATE INDEX idx_inspection_reviews_inspection ON public.inspection_reviews(inspection_id);

-- 17. Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('inspection-photos', 'inspection-photos', true);

-- 18. Storage policies
CREATE POLICY "Authenticated users can upload inspection photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'inspection-photos');

CREATE POLICY "Authenticated users can view inspection photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'inspection-photos');

CREATE POLICY "Authenticated users can delete their own uploads"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'inspection-photos');

-- =====================================================
-- RLS POLICIES
-- =====================================================

-- profiles
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Admins can manage all profiles"
  ON public.profiles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- inspection_source_events (admin only)
CREATE POLICY "Admins can manage source events"
  ON public.inspection_source_events FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- inspection_templates (read for all authenticated, write for admin)
CREATE POLICY "Authenticated users can read templates"
  ON public.inspection_templates FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage templates"
  ON public.inspection_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- inspection_template_sections
CREATE POLICY "Authenticated users can read template sections"
  ON public.inspection_template_sections FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage template sections"
  ON public.inspection_template_sections FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- inspection_template_fields
CREATE POLICY "Authenticated users can read template fields"
  ON public.inspection_template_fields FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage template fields"
  ON public.inspection_template_fields FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- inspections
CREATE POLICY "Admins can manage all inspections"
  ON public.inspections FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Inspectors can view assigned inspections"
  ON public.inspections FOR SELECT TO authenticated
  USING (inspector_id = auth.uid());

CREATE POLICY "Inspectors can update assigned inspections"
  ON public.inspections FOR UPDATE TO authenticated
  USING (inspector_id = auth.uid());

CREATE POLICY "Executives can view assigned inspections"
  ON public.inspections FOR SELECT TO authenticated
  USING (executive_id = auth.uid());

CREATE POLICY "Executives can update assigned inspections"
  ON public.inspections FOR UPDATE TO authenticated
  USING (executive_id = auth.uid());

-- inspection_sections
CREATE POLICY "Admins can manage all sections"
  ON public.inspection_sections FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Inspectors can view sections of assigned inspections"
  ON public.inspection_sections FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.inspections
    WHERE inspections.id = inspection_sections.inspection_id
    AND inspections.inspector_id = auth.uid()
  ));

CREATE POLICY "Inspectors can update sections of assigned inspections"
  ON public.inspection_sections FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.inspections
    WHERE inspections.id = inspection_sections.inspection_id
    AND inspections.inspector_id = auth.uid()
  ));

CREATE POLICY "Executives can view sections of assigned inspections"
  ON public.inspection_sections FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.inspections
    WHERE inspections.id = inspection_sections.inspection_id
    AND inspections.executive_id = auth.uid()
  ));

CREATE POLICY "Executives can update sections of assigned inspections"
  ON public.inspection_sections FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.inspections
    WHERE inspections.id = inspection_sections.inspection_id
    AND inspections.executive_id = auth.uid()
  ));

-- inspection_field_values
CREATE POLICY "Admins can manage all field values"
  ON public.inspection_field_values FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Inspectors can view field values of assigned inspections"
  ON public.inspection_field_values FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.inspections
    WHERE inspections.id = inspection_field_values.inspection_id
    AND inspections.inspector_id = auth.uid()
  ));

CREATE POLICY "Inspectors can upsert field values of assigned inspections"
  ON public.inspection_field_values FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.inspections
    WHERE inspections.id = inspection_field_values.inspection_id
    AND inspections.inspector_id = auth.uid()
  ));

CREATE POLICY "Inspectors can update field values of assigned inspections"
  ON public.inspection_field_values FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.inspections
    WHERE inspections.id = inspection_field_values.inspection_id
    AND inspections.inspector_id = auth.uid()
  ));

CREATE POLICY "Executives can view field values of assigned inspections"
  ON public.inspection_field_values FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.inspections
    WHERE inspections.id = inspection_field_values.inspection_id
    AND inspections.executive_id = auth.uid()
  ));

CREATE POLICY "Executives can update field values of assigned inspections"
  ON public.inspection_field_values FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.inspections
    WHERE inspections.id = inspection_field_values.inspection_id
    AND inspections.executive_id = auth.uid()
  ));

-- inspection_photos
CREATE POLICY "Admins can manage all photos"
  ON public.inspection_photos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Inspectors can view photos of assigned inspections"
  ON public.inspection_photos FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.inspections
    WHERE inspections.id = inspection_photos.inspection_id
    AND inspections.inspector_id = auth.uid()
  ));

CREATE POLICY "Inspectors can insert photos for assigned inspections"
  ON public.inspection_photos FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.inspections
    WHERE inspections.id = inspection_photos.inspection_id
    AND inspections.inspector_id = auth.uid()
  ));

CREATE POLICY "Inspectors can delete photos from assigned inspections"
  ON public.inspection_photos FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.inspections
    WHERE inspections.id = inspection_photos.inspection_id
    AND inspections.inspector_id = auth.uid()
  ));

CREATE POLICY "Executives can view photos of assigned inspections"
  ON public.inspection_photos FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.inspections
    WHERE inspections.id = inspection_photos.inspection_id
    AND inspections.executive_id = auth.uid()
  ));

-- inspection_reviews
CREATE POLICY "Admins can manage all reviews"
  ON public.inspection_reviews FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Inspectors can view reviews of assigned inspections"
  ON public.inspection_reviews FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.inspections
    WHERE inspections.id = inspection_reviews.inspection_id
    AND inspections.inspector_id = auth.uid()
  ));

CREATE POLICY "Executives can view reviews of assigned inspections"
  ON public.inspection_reviews FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.inspections
    WHERE inspections.id = inspection_reviews.inspection_id
    AND inspections.executive_id = auth.uid()
  ));

CREATE POLICY "Executives can create reviews for assigned inspections"
  ON public.inspection_reviews FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.inspections
    WHERE inspections.id = inspection_reviews.inspection_id
    AND inspections.executive_id = auth.uid()
  ));

-- inspection_report_versions (admin + executive read)
CREATE POLICY "Admins can manage report versions"
  ON public.inspection_report_versions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Executives can view report versions"
  ON public.inspection_report_versions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.inspections
    WHERE inspections.id = inspection_report_versions.inspection_id
    AND inspections.executive_id = auth.uid()
  ));
