# Executive Review — IA & Usability Refactor

Refactor the Executive Review Detail screen to reduce cognitive load and clarify section navigation. No visual redesign, no DB/RLS/workflow changes. Most upstream concerns (autosave, ToggleGroup payer, executive filter on Schedule, photos lifted into parent) are already implemented; this plan focuses on what is still pending.

## Scope

Only these files change:
- `src/pages/executive/review-detail/SectionSidebar.tsx`
- `src/pages/executive/review-detail/SectionWorkspace.tsx`
- `src/pages/executive/review-detail/ReviewHeaderBar.tsx`
- `src/pages/executive/review-detail/PhotoPanel.tsx`
- `src/pages/executive/ExecutiveReviewDetail.tsx` (wiring only)

Not touched: `useReviewDetail`, `useReviewActions`, repair services, RLS, types, routes, status registry, BudgetSummaryBar.

---

## Change 1 — Split sidebar into two blocks: "Datos" vs "Secciones"

In `SectionSidebar`:
- Receive both `metaSections` and `operationalSections` (parent already filters; pass both).
- Render two labeled groups:

```text
DATOS DE LA INSPECCIÓN
- Dirección / Fecha / Inspector  (read-only summary chip, not clickable items)
- Firma del inquilino            (existing signature card stays)
- Información general            (only meta sections that have content)

SECCIONES
- Living            2 reparaciones
- Cocina            1 reparación
- Dormitorio 1      Revisada
```

- Meta sections (`section_type === 'property_meta' | 'handover_meta'`) become a compact, lighter-weight list under DATOS — selectable, but visually distinct (muted, no repair counts, no status badge).
- Physical sections stay under SECCIONES exactly as today.
- `ExecutiveReviewDetail` already excludes meta sections from `operationalSections`; just thread the meta list through and allow `activeSectionId` to point at a meta section (Workspace already renders fields generically).

## Change 2 — Remove ambiguous indicators from section rows

In `SectionSidebar` operational list:
- Remove the `Wrench` icon next to the title.
- Remove the leading `AlertTriangle` icon on each row (keep the aggregate warning banner at the top — that one is meaningful).
- Show, right-aligned, ONE of: repair count (`"2 reparaciones"` / `"1 reparación"`) when > 0, else the existing status badge text ("Revisada", "Pendiente").
- Keep the missing-observation amber tint on the row background (no icon) so the cue survives without noise.

## Change 3 — De-duplicate repairs surface

Three places show repairs today: header bar button (`Reparaciones · N`), in-workspace "Reparaciones de esta sección" card, and the inline/drawer panel. Consolidate:

- **Sidebar**: repair count text per section (Change 2). Single source of "where are the repairs".
- **Workspace**: keep the per-section card as the primary review surface for that section's repairs. This is the only place inside the body that lists repairs.
- **Header bar**: replace the `Reparaciones · N` button with a small read-only chip in `BudgetSummaryBar` area (`N reparaciones`). The action to open the editing panel moves to the workspace card's existing CTA. Removing the header button eliminates the third duplicated surface and a redundant click target.
- **Right column / inline panel**: unchanged behavior — opens from the workspace CTA.

## Change 4 — Workspace hierarchy pass (typography only, no redesign)

In `SectionWorkspace`:
- Section title: `text-h3 font-semibold` (currently `text-h4`).
- Field labels: keep `text-muted-foreground`, drop to `text-[11px]` uppercase tracking-wide for consistency with the rest of the app.
- Field values: `text-foreground` (currently inherits and reads muted).
- Observation cards: bump to `bg-card border shadow-sm rounded-lg` (today inspector obs is borderless-ish). Keep the primary left border on "Observación Final".
- Internal note: keep muted bg, add `shadow-sm`.

No new tokens, no color changes, no spacing overhaul beyond these.

## Change 5 — Right column = photos only

`PhotoPanel` already owns photos+upload+lightbox+delete and uses signed URLs from the parent. Pending tweaks:
- Add a small header `FOTOS` label (uppercase, muted, tracking-wide) so the column reads as a dedicated context panel.
- Increase grid to `grid-cols-2` always (drop `xl:grid-cols-3`) and bump `aspect-square` → `aspect-[4/3]` so thumbnails are noticeably larger in the 300px column.
- No new features (no AI suggestions, no activity). Just the photo panel, cleaner.

When the inline repairs panel is open and PhotoPanel is hoisted into the workspace as `photosSlot`, render the same component — already wired.

---

## Out of scope (already done in prior work, verified above)

- Autosave on final observation + internal note (`useDebouncedAutosave` in `SectionWorkspace`).
- ToggleGroup-style payer selector (`SectionRepairsPanel` already uses two big buttons for owner/tenant).
- Repair creation in Sheet, not Dialog (`SectionRepairsDrawer` uses `Sheet`; catalog uses `RepairCatalogSheet`).
- Executive filter on Schedule (`ExecutiveSchedule.tsx` already reads/writes `?exec=` with a Select).
- Signed URLs lifted to parent (`useSignedPhotoUrls` in `ExecutiveReviewDetail`, passed as `urlOf` prop).

## Verification

After implementing:
1. Open `/executive/inspection/:id` — confirm two-block sidebar, no wrench/alert icons on rows, repair counts visible.
2. Click a meta section ("Datos del inmueble") — Workspace renders its fields; no repair card appears (already gated by `repairs.length`, will read empty).
3. Header bar shows budget + `N reparaciones` chip, no standalone Reparaciones button.
4. Right column shows larger 2-col photo grid with FOTOS header.
5. Open inline repairs panel — PhotoPanel migrates into workspace slot, no remount flicker, URLs persist.
