

# Plan: Executive Desktop-First Workspace + Contractors + Inspector Progress Visibility

## Summary

Rewrite the Executive Review Detail as a desktop-first review workstation. Add contractor management, dual pricing, publish validation, and inspector progress visibility. 2 DB migrations, ~6 file changes.

---

## Database Migrations

### Migration 1: Contractors table

```sql
CREATE TABLE public.contractors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  country text NOT NULL DEFAULT 'CL',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.contractors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage contractors" ON public.contractors
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Executives can read active contractors" ON public.contractors
  FOR SELECT TO authenticated USING (is_active = true AND has_role(auth.uid(), 'executive'));
```

### Migration 2: Contractor FK + dual pricing

```sql
ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS contractor_id uuid REFERENCES public.contractors(id);

ALTER TABLE public.inspection_repair_items
  ADD COLUMN IF NOT EXISTS contractor_unit_price numeric NOT NULL DEFAULT 0;
```

`contractor_id` has an explicit FK to `contractors(id)`. `contractor_unit_price` is manually entered by the executive per repair item (no auto-sourcing from a contractor pricing model in this MVP).

---

## Types (`src/lib/types.ts`)

- Add `Contractor` interface: `{ id, name, country, is_active, created_at }`
- Add `contractor_id?: string | null` to `Inspection`
- Add `contractor_unit_price: number` to `InspectionRepairItem`

---

## Centralized publish validation (`src/lib/section-completion.ts`)

Add a `requiresFinalObservation(sectionType)` function:

```ts
const EXEMPT_FROM_FINAL_OBS = new Set(['property_meta', 'handover_meta', 'admin_meta']);

export function requiresFinalObservation(sectionType: string): boolean {
  return !EXEMPT_FROM_FINAL_OBS.has(sectionType);
}
```

Executive publish logic calls this per section instead of hardcoding exclusions inline.

---

## Executive Review Detail — Full Rewrite (`src/pages/executive/ExecutiveReviewDetail.tsx`)

~850 lines → new desktop-first layout.

### Desktop layout (lg+)

```text
┌──────────────────────────────────────────────────────────────┐
│ STICKY TOP SUMMARY BAR                                        │
│ Property | Address | Stage | Published badge                  │
│ Depósito en garantía: $X | Presupuesto: $Y | Diff: $Z        │
│ Contractor: [dropdown] | Costo contratista: $A | Utilidad: $B │
│ [Copy Link] [Abrir Reporte] [Publicar / Republicar]          │
├──────────┬──────────────────────────────┬────────────────────┤
│ LEFT     │ CENTER                        │ RIGHT              │
│ Section  │ Side-by-side observations     │ Photos gallery     │
│ nav w/   │ ┌──────────┬────────────────┐ │                    │
│ status + │ │Inspector │Final public    │ │ Depósito vs Budget │
│ missing  │ │(slate bg)│(emerald bg)    │ │ card               │
│ obs dot  │ └──────────┴────────────────┘ │                    │
│          │ Internal note                 │ Contractor pricing │
│          │ Repair items (dual pricing)   │ summary            │
└──────────┴──────────────────────────────┴────────────────────┘
```

### Key behaviors

1. **Sticky top bar**: Property info, stage badge, published/not-published badge. `warranty_deposit` from `getEffectiveSnapshot()` displayed as "Depósito en garantía". Client budget total, difference, contractor dropdown (from `contractors` table), contractor total, utility (internal). Actions: Copy Link, Abrir Reporte Propietario, Publicar/Republicar.

2. **Left sidebar**: Section list with status badges. Red dot if `requiresFinalObservation(section.section_type)` and `final_observation` is empty. Click selects active section.

3. **Center workspace**: Side-by-side comparison — inspector observation (bg `slate-50`) vs final observation textarea (bg `emerald-50/30`). Internal note textarea. Repair items with dual pricing: `unit_price` (Precio cliente, editable), `contractor_unit_price` (Precio contratista, editable by executive after contractor selection), utility per item calculated. Editable `description_snapshot` per item.

4. **Right panel**: Photo gallery for active section, owner visibility toggles. Depósito vs budget comparison card with status ("Cubierto por depósito" / "Excede depósito"). Contractor pricing summary.

5. **Publish validation**: Uses `requiresFinalObservation()`. Blocks publish with message: "Faltan observaciones finales en N secciones" listing section names.

6. **Republish**: If already published (`published_at` exists), show "Republicar" (outline style). Creates new version via existing logic.

7. **Inspector progress in top bar**: Derived from `started_at`, `last_active_at`, section progress. Shows "Pendiente de inicio" / "Inspección iniciada" / progress count.

### Mobile fallback (< lg)

Functional but not primary. Compact top summary card. Stacked observations (not side-by-side). Tabs: Revisión | Presupuesto | Compartir. Quick action buttons card. No rich desktop workspace features.

### Pricing behavior (MVP)

`contractor_unit_price` is **manually entered by the executive** per repair item after selecting a contractor. No automatic contractor pricing model in this iteration. Selecting a contractor enables the contractor price fields but does not auto-fill them.

---

## Executive Review Queue (`src/pages/executive/ExecutiveReviewQueue.tsx`)

Add inspector progress visibility without N+1 queries:

- Single query: fetch all inspections with a **subquery/join** to get section counts per inspection:
  ```ts
  // After fetching inspections, batch-fetch sections for all inspection IDs
  const inspIds = inspections.map(i => i.id);
  const { data: allSections } = await supabase
    .from('inspection_sections')
    .select('inspection_id, status, is_visible, section_type')
    .in('inspection_id', inspIds);
  // Group and calculate progress client-side per inspection
  ```
- Display per row: "Pendiente de inicio" / "Inspección iniciada", progress bar, section count, relative `last_active_at`.

---

## Admin Contractor Management (`src/pages/admin/AdminSettings.tsx`)

Add a clearly separated, full-width contractor management section with its own card:

- Card header: "Contratistas" with description
- Table: Name, Country, Active toggle, Delete action
- "Agregar contratista" form with name input + country select (CL, MX)
- Visually separated from existing template/rules documentation — placed as a distinct operational section at the top of the settings page

---

## Files Summary

| Action | File |
|---|---|
| Migration | Create `contractors` table with RLS |
| Migration | Add `contractor_id` FK to inspections, `contractor_unit_price` to repair items |
| Edit | `src/lib/types.ts` — add `Contractor`, new fields |
| Edit | `src/lib/section-completion.ts` — add `requiresFinalObservation()` |
| Rewrite | `src/pages/executive/ExecutiveReviewDetail.tsx` — desktop-first workspace |
| Edit | `src/pages/executive/ExecutiveReviewQueue.tsx` — batched progress visibility |
| Edit | `src/pages/admin/AdminSettings.tsx` — contractor management section |

7 changes total (2 migrations, 5 code files).

