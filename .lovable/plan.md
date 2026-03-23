

# Plan: Admin Full Workflow Control + Delete + Progress Fix

## Overview

Upgrade the Admin Inspection Detail to support full end-to-end workflow execution (matching executive capabilities), add inspection deletion, and fix the false progress calculation.

---

## 1. Fix false progress in Admin Inspection tab (lines 654-658)

**Root cause**: The admin calculates section progress as `filled fields / total fields` where `filled = fields with value_text or value_json`. Pre-generated fields have default values, so newly created inspections show non-zero progress.

**Fix**: Replace the per-section field-counting progress with section-level completion status. Use `isSectionCompleted(sec.status)` from `section-completion.ts`. Show `0%` / `Pendiente` for sections that haven't been explicitly completed. Remove the per-field progress bar from the section collapsible — show only the section status badge.

---

## 2. Add executive-like review/budget capabilities to Admin

Port the executive's per-section editing capabilities into the Admin's **Revisión** and **Presupuesto** tabs:

### Revisión tab — per section:
- Show inspector's field values (read-only summary)
- Internal note textarea + save button
- Final observation textarea + save button
- Photo thumbnails with visibility toggle (eye icon)
- Existing review comments list

### Presupuesto tab — per section:
- "Agregar reparación" button → opens catalog sheet
- List of repair items with inline-editable quantity, price, notes
- Delete repair item button
- Visibility toggle per item
- Section subtotal + grand total

### Implementation approach:
Reuse the same Supabase calls already in `ExecutiveReviewDetail.tsx` (save internal note, save final observation, toggle photo visibility, catalog sheet, add/update/delete repair items). Copy the logic into `AdminInspectionDetail.tsx` since admin already has full RLS access.

### New state variables needed:
- `internalNotes: Record<string, string>`
- `finalObservations: Record<string, string>`
- `savingField: string | null`
- `catalogOpen`, `catalogSearch`, `catalogItems`, `catalogSectionId`
- `repairsBySection` (reorganize existing flat `repairItems`)

### New functions:
- `saveInternalNote(sectionId)`
- `saveFinalObservation(sectionId)`
- `togglePhotoVisibility(photo)`
- `openCatalog(sectionId)`
- `addRepairFromCatalog(item)`
- `updateRepairItem(id, field, value)`
- `deleteRepairItem(id)`

---

## 3. Add delete inspection capability

### UI:
- Add a "Eliminar inspección" danger button in the Admin Actions bar
- Wrapped in an `AlertDialog` with:
  - Title: "¿Eliminar esta inspección?"
  - Description: warns about cascading data removal
  - Cancel + destructive Confirm button

### Implementation:
- Delete related records in order (field_values, photos, reviews, repair_items, sections, audit_log, report_versions, then the inspection itself)
- On success, navigate back to `/admin/inspections`
- Log is not needed since the inspection itself is being deleted

### Database:
No migration needed — admin has full RLS access. Cascade deletes are done via ordered delete statements (no FK cascades are set up, so we delete manually).

---

## 4. Reorganize data loading

Restructure `fetchAll` to also group data by section (matching executive pattern) so the review/budget tabs can render per-section data efficiently. Initialize `finalObservations` and `internalNotes` state from loaded data.

---

## Files Summary

| Action | File |
|---|---|
| Rewrite | `src/pages/admin/AdminInspectionDetail.tsx` — add executive capabilities, delete, fix progress |

1 file change.

