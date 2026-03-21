

# Refined Plan: Executive Review + Repair Catalog + Owner Report

## Refinements Applied

All 9 user refinements are incorporated below.

---

## 1. Database Migrations

### Migration 1: `repair_catalog_categories` (normalized categories)

```sql
CREATE TABLE public.repair_catalog_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.repair_catalog_categories ENABLE ROW LEVEL SECURITY;
-- Admin full access
-- Authenticated read
```

### Migration 2: `repair_catalog_items`

```sql
CREATE TABLE public.repair_catalog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_friendly_name text,
  category_id uuid NOT NULL REFERENCES repair_catalog_categories(id),
  description text,
  unit text NOT NULL DEFAULT 'unit',
  pricing_type text NOT NULL DEFAULT 'fixed',
  base_price numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'MXN',
  market text,
  is_active boolean NOT NULL DEFAULT true,
  internal_notes text,
  created_by uuid REFERENCES profiles(id),
  updated_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- RLS: admin full, executive SELECT where is_active=true
```

### Migration 3: `inspection_repair_items`

```sql
CREATE TABLE public.inspection_repair_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  inspection_section_id uuid NOT NULL REFERENCES inspection_sections(id) ON DELETE CASCADE,
  repair_catalog_item_id uuid REFERENCES repair_catalog_items(id),
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
  created_by uuid REFERENCES profiles(id),
  updated_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- RLS: admin full, executive CRUD on assigned inspections
```

Key: `subtotal` is a **generated column** — always `quantity * unit_price`, never manually set.

### Migration 4: Add `is_latest` + remove `published_url` from `inspection_report_versions`

```sql
ALTER TABLE inspection_report_versions
  ADD COLUMN is_latest boolean NOT NULL DEFAULT false,
  DROP COLUMN IF EXISTS published_url;
```

No anonymous SELECT policy on this table. Instead, a secure RPC.

### Migration 5: Add `visible_to_owner` to `inspection_photos`

```sql
ALTER TABLE inspection_photos
  ADD COLUMN visible_to_owner boolean NOT NULL DEFAULT true;
```

For MVP, all photos default to visible. Executives can toggle off specific photos during review.

### Migration 6: Public report RPC (security definer)

```sql
CREATE OR REPLACE FUNCTION public.get_published_report(p_property_id text, p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  v_inspection_id uuid;
  v_version_id uuid;
BEGIN
  SELECT irv.id, irv.inspection_id INTO v_version_id, v_inspection_id
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
```

Anonymous users call this RPC only — no direct table access.

### Migration 7: Executives can INSERT report versions

```sql
CREATE POLICY "Executives can insert report versions for assigned inspections"
ON inspection_report_versions FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM inspections WHERE id = inspection_report_versions.inspection_id AND executive_id = auth.uid()
));

CREATE POLICY "Executives can update report versions for assigned inspections"
ON inspection_report_versions FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM inspections WHERE id = inspection_report_versions.inspection_id AND executive_id = auth.uid()
));
```

---

## 2. Types Update (`src/lib/types.ts`)

Add interfaces:
- `RepairCatalogCategory`
- `RepairCatalogItem` (with `category_id` referencing categories)
- `InspectionRepairItem` (subtotal is read-only/computed)
- `InspectionReportVersion` (with `is_latest`, no `published_url`)

---

## 3. Admin Repair Catalog (`src/pages/admin/AdminRepairCatalog.tsx`)

- CRUD for categories (small manager at top or side panel)
- CRUD for catalog items with category dropdown (normalized, not free-text)
- Filter by category, market, active status
- Search by name
- Route: `/admin/catalog`, added to AdminLayout sidebar

---

## 4. Executive Review Detail — Full Refactor (`src/pages/executive/ExecutiveReviewDetail.tsx`)

Per section, load and support editing:
1. **Inspector observation** — read-only from field_values
2. **Internal comments** — load existing from `inspection_reviews` where `comment_type='internal_note'`, editable textarea, save/update
3. **Final public observation** — load from `inspection_sections.final_observation`, editable textarea, save
4. **Photo visibility** — toggle `visible_to_owner` per photo
5. **Repair items** — load existing `inspection_repair_items` for this section:
   - Edit quantity, unit_price, notes, visibility, reorder
   - Delete items
   - "Add repair" button opens catalog search drawer
   - Section subtotal shown (sum of generated subtotals)

At inspection level:
- Grand total budget card
- **Publish CTA** with validations

### Publish validations (minimum)
Before publishing, check:
- At least one section has a `final_observation`
- At least one repair item exists (or explicitly allow empty budget)
- No sections in `needs_changes` status
- Show validation errors if not met

### Publish logic
1. Build `normalized_payload` JSON: property snapshot, sections with final_observations, visible photos (`visible_to_owner = true`), visible repair items with subtotals
2. Generate `public_token = crypto.randomUUID()`
3. Determine `version_number = max(existing) + 1`
4. Set previous `is_latest = false` for this inspection
5. Insert new version with `is_latest = true`, `status = 'published'`
6. Update inspection status to `published`
7. Construct shareable URL client-side: `/reportes/{property_id}/{public_token}`
8. Show copyable link

---

## 5. Owner-Facing Public Page (`src/pages/public/OwnerReport.tsx`)

- Route: `/reportes/:propertyId/:token` (no ProtectedRoute)
- Calls RPC `get_published_report(propertyId, token)` — no direct table access
- Two tabs: **Reporte de Inspección** | **Presupuesto**
- Reporte: property summary, per-section final observations + visible photos
- Presupuesto: repairs grouped by section, quantities, prices, subtotals, grand total
- Responsive, standalone branded page, no sidebar

---

## 6. Route & Nav Updates

**`App.tsx`:**
- Add `/admin/catalog` (admin protected)
- Add `/reportes/:propertyId/:token` (public)

**`AdminLayout.tsx`:**
- Add "Catálogo" nav item

---

## 7. Fix Build Error

`InspectorInspectionDetail.tsx` — the file has only one `cn` import (line 27). Will do a clean rewrite of the import block to clear the stale TS error.

---

## Files Summary

| Action | File |
|---|---|
| Migration | `repair_catalog_categories` table + RLS |
| Migration | `repair_catalog_items` table + RLS |
| Migration | `inspection_repair_items` table (generated subtotal) + RLS |
| Migration | `inspection_report_versions`: add `is_latest`, drop `published_url`, exec INSERT/UPDATE policies |
| Migration | `inspection_photos`: add `visible_to_owner` |
| Migration | `get_published_report` RPC (security definer) |
| Create | `src/pages/admin/AdminRepairCatalog.tsx` |
| Create | `src/pages/public/OwnerReport.tsx` |
| Edit | `src/lib/types.ts` (new interfaces) |
| Edit | `src/pages/executive/ExecutiveReviewDetail.tsx` (full refactor) |
| Edit | `src/App.tsx` (new routes) |
| Edit | `src/components/AdminLayout.tsx` (catalog nav) |
| Edit | `src/pages/inspector/InspectorInspectionDetail.tsx` (fix import) |

~13 files, 6-7 migrations.

