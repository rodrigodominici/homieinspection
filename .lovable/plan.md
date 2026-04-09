

# Plan: Executive UX Action Bar + State Consistency Fix

## Summary

Move desktop workflow actions (Devolver/Aprobar) from the fixed bottom bar to the sticky top header. Suppress the "observaciones pendientes" warning when inspection is already approved/published. 1 file change, no migrations.

---

## Changes in `src/pages/executive/ExecutiveReviewDetail.tsx`

### 1. Move desktop actions to sticky top bar

**Remove**: The entire `<div className="hidden lg:block">` block (lines 842-881) containing the fixed bottom action bar for desktop.

**Add**: Inside the sticky top header (line 468 area, the `hidden lg:flex items-center gap-2` div), add the Devolver/Aprobar buttons alongside the existing Publicar/Republicar actions. The return-mode confirmation also moves to a top bar row.

Layout:
- Row 1 right side: Back + Property info + Status badge + [Devolver | Aprobar | Publicar/Republicar | Abrir reporte | Copiar link]
- When `returnMode` is active, show a secondary row below with cancel + "Devolver (N)" buttons
- Mobile bottom bar (lines 820-838) stays unchanged — it's appropriate for mobile

### 2. Suppress warnings for approved/published inspections

**Change**: The `missingSections` badge in Row 3 (line 565) and the sidebar summary (line 650) should only render when the inspection status is NOT `approved` and NOT `published`.

Add condition:
```tsx
const showObservationWarnings = !['approved', 'published'].includes(inspection.status);
```

Then wrap both warning locations with `showObservationWarnings &&`.

Also in `handleApprove`: no changes needed — approval is currently unrestricted. The warnings become informational only (visible during review, hidden after approval).

### 3. Approval validation (preferred behavior)

Add a soft block: the Aprobar button shows a tooltip or is visually flagged when `missingSections.length > 0`, but does NOT hard-block since the user explicitly stated "or suppress after approval". The current approach suppresses warnings post-approval, which is the simpler and cleaner path.

---

## Detailed edits

1. **Lines 842-881** (desktop bottom bar): Delete entirely
2. **Lines 468-494** (top right actions): Add Devolver + Aprobar buttons alongside Publicar
3. **Line 563-570** (blocker badges): Wrap with `showObservationWarnings`
4. **Lines 650-655** (sidebar warning): Wrap with `showObservationWarnings`
5. Add `returnMode` top bar row after Row 1 inside the sticky header

---

## Files Summary

| Action | File |
|---|---|
| Edit | `src/pages/executive/ExecutiveReviewDetail.tsx` — move actions to top, suppress post-approval warnings |

1 file change. No migrations.

