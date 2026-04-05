

# Plan: Fix Executive Review Queue Card Pattern + Inspector Filter UUID

## Summary

Two targeted fixes in `ExecutiveReviewQueue.tsx`: (1) make `InspectionRow` render the "Por coordinar" card pattern for uncoordinated inspections, and (2) fix the inspector filter fallback from raw UUID to human-readable name. 1 file change, no migrations.

---

## Analysis

- **Admin calendar** (`AdminSchedule.tsx`): Already has coordination banner row in the grid — working correctly.
- **Executive calendar** (`ExecutiveSchedule.tsx`): Already has coordination banner row — working correctly.
- **Inspector calendar** (`InspectorCalendar.tsx`): Already delegates to `CoordinationCard` for uncoordinated items — working correctly.
- **Admin inspection list** (`AdminInspections.tsx`): Already has dual card pattern with "Por coordinar" badge (lines 314-354) — working correctly.
- **Executive Review Queue** (`ExecutiveReviewQueue.tsx`): `InspectionRow` (lines 392-465) always shows `InspectionStatusBadge` regardless of coordination state. Inspector filter (line 144) falls back to `?? id` showing raw UUIDs.

---

## File Changes

### `src/pages/executive/ExecutiveReviewQueue.tsx`

**Fix 1: Inspector filter UUID fallback** (line 144):
```
Before: ids.map(id => ({ id, name: inspectorProfiles[id]?.full_name ?? id }))
After:  ids.map(id => ({ id, name: inspectorProfiles[id]?.full_name ?? inspectorProfiles[id]?.email ?? 'Inspector sin nombre' }))
```

**Fix 2: Uncoordinated card pattern in `InspectionRow`** (lines 409-441):

Add detection of uncoordinated state using the snapshot:
- Check if `fecha_recoleccion_llaves` is missing but `fecha_de_termino_real_de_contrato` exists
- Compute `contractEndDate` from snapshot

When uncoordinated:
- Card ring changes to `ring-amber-200` with dashed style
- Replace `InspectionStatusBadge` with amber "Por coordinar" badge
- Replace "Recolección: date" with "Término de contrato: date" in amber text
- Keep progress bar and other metadata unchanged

When coordinated (has `fecha_recoleccion_llaves`): no changes, existing rendering preserved.

---

## Files Summary

| Action | File |
|---|---|
| Edit | `src/pages/executive/ExecutiveReviewQueue.tsx` — inspector filter fallback + uncoordinated card pattern |

1 file change. No migrations.

