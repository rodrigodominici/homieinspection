

# Plan: Strict Date/State Consistency Cleanup

## Summary

Fix remaining label inconsistencies across Admin and Inspector: replace legacy "Programada" with `fecha_recoleccion_llaves`, relabel "Fecha devolución llave" clearly, relabel "Fecha inspección" in PropertyBriefingCard, and fix the Inspector display state so 100% complete never shows "En progreso". 4 file changes, no migrations.

---

## Current Issues Found

1. **AdminInspectionDetail** (line 574): Summary shows "Programada" reading `scheduled_at` — legacy field
2. **AdminInspectionDetail** (line 782): Edit field labeled "Fecha/Hora programada" writing `scheduled_at`
3. **AdminInspectionDetail** (line 723): "Fecha devolución llave" — this is a legitimate separate concept (`fecha_devolucion_llave` = post-inspection key return), but the label is unclear
4. **PropertyBriefingCard** (line 77): Shows "Fecha inspección" for `fecha_recoleccion_llaves` — ambiguous label
5. **InspectorStatusBadge/display state**: 100% complete but not submitted still possible to show "En progreso" if DB status is `in_progress` and `started_at` is set (line 91 fires before line 87 check only when totalSections > 0 AND completedSections == totalSections — actually this IS correct in current code). Let me re-verify...

Actually re-reading `getInspectorDisplayState`: line 87 checks `progressPercent === 100 && totalSections > 0` BEFORE line 91 checks `progressPercent > 0`. So 100% should return `ready_to_submit` correctly. The issue might be that `StatusBadge.tsx` (shared component) shows raw DB status "En Progreso" when used in non-Inspector contexts where the display state helper is not called.

6. **StatusBadge.tsx** (line 7): `in_progress` always shows "En Progreso" — this is the shared badge used by `PropertyBriefingCard` (line 49) via `InspectionStatusBadge`. Inspector cards use `InspectorStatusBadge` (derived state). The conflict is that `PropertyBriefingCard` shows raw "En Progreso" badge even at 100%.

---

## File Changes

### 1. `src/components/PropertyBriefingCard.tsx`
- Relabel "Fecha inspección" → **"Recolección de llaves"** (the actual operational meaning)
- Remove the `InspectionStatusBadge` from the header — this card is a briefing card, not a status card. The status is shown elsewhere (Inspector detail progress card, Admin detail header). This prevents the raw "En Progreso" at 100% conflict.

### 2. `src/pages/admin/AdminInspectionDetail.tsx`
- **Summary bar** (line 574): Replace "Programada" / `scheduled_at` with `fecha_recoleccion_llaves` from effective snapshot, labeled **"Recolección llaves"**. Show "Sin coordinar" if missing.
- **Edit field** (line 782): Relabel "Fecha/Hora programada" → **"Fecha programada (legacy)"** to clearly mark it as deprecated. Keep functional for backward compat.
- **Key return** (line 723): Relabel "Fecha devolución llave" → **"Devolución de llave (post-inspección)"** to distinguish from key collection.

### 3. `src/components/StatusBadge.tsx`
- No structural change. This component shows raw DB status and is correct for Admin/Executive contexts. The fix is removing it from PropertyBriefingCard (which is used in Inspector detail where derived state should prevail).

### 4. `src/pages/inspector/InspectorInspectionDetail.tsx`
- After removing status badge from PropertyBriefingCard, add a small inline display state indicator next to the progress card or header that uses `InspectorStatusBadge` (already imported and computed as `displayState`). This ensures the Inspector detail shows the correct derived state label.

---

## Display State Verification

The `getInspectorDisplayState` logic is already correct:
- 100% + not submitted → `ready_to_submit` ("Lista para enviar")
- 1-99% → `in_progress` ("En progreso")

The bug is that `PropertyBriefingCard` renders `InspectionStatusBadge` which reads raw DB `status`, not the derived Inspector display state. Fix: remove it from the briefing card.

---

## Label Normalization Summary

| Old Label | New Label | Field |
|---|---|---|
| "Programada" (Admin summary) | "Recolección llaves" | `fecha_recoleccion_llaves` from snapshot |
| "Fecha/Hora programada" (Admin edit) | "Fecha programada (legacy)" | `scheduled_at` |
| "Fecha devolución llave" (Admin) | "Devolución de llave (post-inspección)" | `fecha_devolucion_llave` |
| "Fecha inspección" (Briefing card) | "Recolección de llaves" | `fecha_recoleccion_llaves` |
| Raw "En Progreso" badge in briefing | Removed from briefing card | — |

---

## Files Summary

| Action | File |
|---|---|
| Edit | `src/components/PropertyBriefingCard.tsx` — relabel + remove status badge |
| Edit | `src/pages/admin/AdminInspectionDetail.tsx` — summary + edit field + key return labels |
| Edit | `src/pages/inspector/InspectorInspectionDetail.tsx` — add derived state badge to header |

3 file changes. No migrations.

