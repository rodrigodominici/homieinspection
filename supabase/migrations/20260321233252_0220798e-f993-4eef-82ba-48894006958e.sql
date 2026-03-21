
-- Migration 1: repair_catalog_categories + repair_catalog_items + inspection_repair_items
-- + alter inspection_report_versions + alter inspection_photos
-- + RPC get_published_report + RLS policies

-- 1. Repair catalog categories (normalized)
CREATE TABLE public.repair_catalog_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.repair_catalog_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage repair categories"
  ON public.repair_catalog_categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can read active repair categories"
  ON public.repair_catalog_categories FOR SELECT TO authenticated
  USING (is_active = true);

-- 2. Repair catalog items
CREATE TABLE public.repair_catalog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_friendly_name text,
  category_id uuid NOT NULL REFERENCES public.repair_catalog_categories(id),
  description text,
  unit text NOT NULL DEFAULT 'unit',
  pricing_type text NOT NULL DEFAULT 'fixed',
  base_price numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'MXN',
  market text,
  is_active boolean NOT NULL DEFAULT true,
  internal_notes text,
  created_by uuid REFERENCES public.profiles(id),
  updated_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.repair_catalog_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage repair catalog items"
  ON public.repair_catalog_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Executives can read active repair catalog items"
  ON public.repair_catalog_items FOR SELECT TO authenticated
  USING (is_active = true AND public.has_role(auth.uid(), 'executive'));

-- 3. Inspection repair items (with generated subtotal)
CREATE TABLE public.inspection_repair_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,
  inspection_section_id uuid NOT NULL REFERENCES public.inspection_sections(id) ON DELETE CASCADE,
  repair_catalog_item_id uuid REFERENCES public.repair_catalog_items(id),
  title_snapshot text NOT NULL,
  owner_friendly_name_snapshot text,
  description_snapshot text,
  category_snapshot text,
  unit text NOT NULL DEFAULT 'unit',
  pricing_type text NOT NULL DEFAULT 'fixed',
  quantity numeric(10,2) NOT NULL DEFAULT 1,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  subtotal numeric(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  notes text,
  visible_to_owner boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.profiles(id),
  updated_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.inspection_repair_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all repair items"
  ON public.inspection_repair_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Executives can manage repair items of assigned inspections"
  ON public.inspection_repair_items FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.inspections
    WHERE inspections.id = inspection_repair_items.inspection_id
      AND inspections.executive_id = auth.uid()
  ));

-- 4. Alter inspection_report_versions: add is_latest, drop published_url
ALTER TABLE public.inspection_report_versions
  ADD COLUMN IF NOT EXISTS is_latest boolean NOT NULL DEFAULT false;

ALTER TABLE public.inspection_report_versions
  DROP COLUMN IF EXISTS published_url;

-- Executive INSERT/UPDATE policies on report versions
CREATE POLICY "Executives can insert report versions for assigned inspections"
  ON public.inspection_report_versions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.inspections
    WHERE inspections.id = inspection_report_versions.inspection_id
      AND inspections.executive_id = auth.uid()
  ));

CREATE POLICY "Executives can update report versions for assigned inspections"
  ON public.inspection_report_versions FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.inspections
    WHERE inspections.id = inspection_report_versions.inspection_id
      AND inspections.executive_id = auth.uid()
  ));

-- 5. Add visible_to_owner to inspection_photos
ALTER TABLE public.inspection_photos
  ADD COLUMN IF NOT EXISTS visible_to_owner boolean NOT NULL DEFAULT true;

-- Executive can update photo visibility
CREATE POLICY "Executives can update photos of assigned inspections"
  ON public.inspection_photos FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.inspections
    WHERE inspections.id = inspection_photos.inspection_id
      AND inspections.executive_id = auth.uid()
  ));

-- 6. Public report RPC (security definer, no direct table access for anon)
CREATE OR REPLACE FUNCTION public.get_published_report(p_property_id text, p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  v_version_id uuid;
BEGIN
  SELECT irv.id INTO v_version_id
  FROM inspection_report_versions irv
  JOIN inspections i ON i.id = irv.inspection_id
  WHERE irv.public_token = p_token
    AND i.property_id = p_property_id
    AND irv.status = 'published'
    AND irv.is_latest = true;

  IF v_version_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT irv.normalized_payload INTO result
  FROM inspection_report_versions irv
  WHERE irv.id = v_version_id;

  RETURN result;
END;
$$;

-- Allow anonymous calls to the RPC
GRANT EXECUTE ON FUNCTION public.get_published_report(text, text) TO anon;

-- Updated_at triggers for new tables
CREATE TRIGGER update_repair_catalog_items_updated_at
  BEFORE UPDATE ON public.repair_catalog_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_inspection_repair_items_updated_at
  BEFORE UPDATE ON public.inspection_repair_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
