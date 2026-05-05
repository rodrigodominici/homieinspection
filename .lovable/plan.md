# Executive list cards — cleanup pass

Single file: `src/pages/executive/ExecutiveReviewQueue.tsx`. No data, schema, or routing changes.

## 1. Remove pending-observations count from list cards

In `InspectionRow` (lines ~501–507):
- Delete the entire "Row 4" block that renders `{missingObs} observaciones finales pendientes` along with its `AlertTriangle` icon.
- Remove the now-unused `showMissingObsWarning` constant (lines ~442–444) and the `AlertTriangle` import if no longer referenced elsewhere in the file.
- Keep `missingObs` calculation only where it is still needed (CTA wording: `Republicar` vs `Abrir reporte` for published cards). If unused after that, drop it too.

The detail/workspace screen (`ExecutiveReviewDetail`) keeps the full pending-observations context — only the queue card loses the count.

## 2. Tighten card vertical spacing

In `InspectionRow`:
- `CardContent`: `py-3 px-4` → `py-2 px-3`.
- Inner column wrapper: `space-y-1` → `space-y-0.5`.
- Progress row: drop the `mt-0.5` (no longer needed once parent gap is tight).
- Meta row (`gap-3`) → `gap-x-2 gap-y-0.5` to keep wrap tight.

In `BucketSection` (line ~392):
- Card list wrapper: `space-y-2` → `space-y-1.5`.

Section group spacing (lines ~300–311):
- Outer groups: `space-y-8` → `space-y-6`.
- Inner buckets: `space-y-5` → `space-y-4`.

These are the minimal changes that visibly reduce card height and stack density without breaking the existing layout grid or responsive behavior.

## Resulting UX

- **Removed**: the `N observaciones finales pendientes` line from every queue card.
- **Tightened**: card vertical padding (`py-3` → `py-2`), internal row spacing (`space-y-1` → `space-y-0.5`), and gaps between stacked cards and bucket groups.
- **Kept**: main status badge, explicit progress wording + bar (when actionable), and the state-aware CTA.
- **Net effect**: each card is roughly one text line shorter and noticeably denser, so the list scans as a clean status + next-action stack instead of a multi-line warning feed. Pending-observation context still lives — and only lives — inside the review workspace.
