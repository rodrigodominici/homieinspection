

# Plan: Remove `Datos de la Propiedad` from Operational Flow

## Problem

`calculateProgress()` counts ALL visible sections including `property_data` (type `property_meta`). This section is contextual, not operational — it inflates the total count and can prevent 100% completion.

The inspector detail already filters it from the rendered list (`workSections`), but progress is calculated BEFORE that filter. Admin doesn't filter it at all.

## Changes

### 1. `src/lib/inspection-utils.ts` — Exclude `property_meta` from progress

Update `calculateProgress` to accept sections with `section_type` and filter out `property_meta` sections before counting.

```typescript
const NON_OPERATIONAL_TYPES = new Set(['property_meta']);

export function calculateProgress(
  sections: Pick<InspectionSection, 'status' | 'is_visible' | 'section_type'>[]
): ProgressResult {
  const operational = sections.filter(
    (s) => s.is_visible && !NON_OPERATIONAL_TYPES.has(s.section_type)
  );
  // ... rest unchanged
}
```

This single change fixes progress everywhere — inspector, admin, executive — since they all use this function.

### 2. `src/pages/inspector/InspectorInspectionDetail.tsx` — Already correct

- Already renders `PropertyBriefingCard` separately
- Already filters `workSections` for the section list
- Progress fix comes from the utility change above
- No code changes needed beyond ensuring `section_type` is included in the query (it already selects `*`)

### 3. `src/pages/admin/AdminInspectionDetail.tsx` — Filter property_data from section lists

- In the Inspection tab section list, filter out `property_meta` sections so `Datos de la Propiedad` no longer appears as a numbered step
- Add `PropertyBriefingCard` at the top of the Overview tab (already has `inspection` object with snapshot data)
- In Review and Budget tabs, also filter out `property_meta` sections (no review/budget needed for contextual data)
- Admin can still edit property fields via the existing Overview tab fields (address, market, typology, etc.)

### 4. Callers of `calculateProgress` — Update type signatures

All callers already pass full section objects (select `*`), so `section_type` is already available. The only change is the Pick type in the function signature.

Affected files that call `calculateProgress`:
- `InspectorDashboard.tsx` — currently selects only `id, status, is_visible`. Need to add `section_type` to the select.
- `InspectorAllInspections.tsx` — same fix: add `section_type` to select.
- `ExecutiveReviewDetail.tsx` — already selects `*`, no change needed.

## Files Summary

| Action | File |
|---|---|
| Edit | `src/lib/inspection-utils.ts` — filter out `property_meta` |
| Edit | `src/pages/inspector/InspectorDashboard.tsx` — add `section_type` to section select |
| Edit | `src/pages/inspector/InspectorAllInspections.tsx` — add `section_type` to section select |
| Edit | `src/pages/admin/AdminInspectionDetail.tsx` — filter property_meta from section lists, add PropertyBriefingCard to overview |

4 file changes.

