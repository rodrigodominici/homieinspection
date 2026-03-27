

# Plan: Executive UX Refinement — Queue + Detail

## Summary
Rewrite ExecutiveReviewQueue with KPIs, filters (including inspector), calendar view, and contextual CTAs. Refine ExecutiveReviewDetail with blocker indicators, richer sidebar, photo gallery with featured preview, and stronger financial visibility. No migrations needed.

---

## 1. ExecutiveReviewQueue Rewrite (~500 lines)

### Data loading
- Fetch inspections, batch-fetch sections (existing pattern), PLUS batch-fetch inspector profiles (`profiles` table filtered by unique `inspector_id` values) and batch-fetch `inspection_sections.final_observation` for publish-readiness checks.
- All filtering done client-side.

### KPI summary row (4 cards)
- Pendientes de inicio (no `started_at`)
- En progreso (started, not submitted)
- Listas para revisión (submitted/in_review)
- Publicadas

### Filter bar
- Search input (address / property name / property_id)
- Status dropdown
- Market dropdown (derived from data)
- Inspector dropdown (derived from fetched profiles)
- Published filter (all / published / not published)

### View toggle: List / Calendar
- **List**: grouped buckets (Requieren revisión, En curso, Publicadas recientemente, Otras)
- **Calendar**: group by `scheduled_at` date → today / tomorrow / upcoming / past / unscheduled. Each entry shows status badge, inspector name, progress bar, contextual CTA.

### Contextual CTAs (richer logic)
Derive from `current_stage`, `status`, `published_at`, `started_at`, and missing observations count:
- `published` → "Abrir reporte"
- `approved` + not published → "Publicar"  
- `submitted`/`in_review` → "Revisar"
- `assigned`/`in_progress` + started → "Ver progreso"
- `assigned` + not started → "Pendiente"
- If published but has changes since → "Republicar" (secondary)

### Inspector progress per card
- Inspector name (from profiles lookup)
- Progress bar + section count
- Last activity relative time

---

## 2. ExecutiveReviewDetail Refinements

### A. Sticky top bar — add blocker indicators (Row 3)
After existing Row 2, add a conditional blocker bar:
- Missing final observations count + names
- Missing contractor warning (if repairs exist but no contractor)
- Unpublished state warning
- Styled as amber/red alert chips

### B. Sidebar enrichment
Per section button, add indicators driven by centralized helpers:
- Red dot: `requiresFinalObservation(s.section_type) && !finalObservations[s.id]?.trim()` (already exists)
- Camera icon + count: `photosBySection[s.id]?.length` (new)
- Wrench icon + count: `repairsBySection[s.id]?.length` (new)
- Warning icon if section blocks publication (missing obs on required type)

### C. Photo panel — featured preview + thumbnails
Replace the 2-column grid with:
- Large featured image (first photo or clicked photo) filling panel width
- Click to open Dialog with full-resolution view
- Below: horizontal thumbnail strip for navigation (scrollable)
- Visibility toggle on each thumbnail
- If ≤4 photos, keep simple grid; if >4, use featured + strip pattern

### D. Financial visibility — section subtotal + running totals
In SectionWorkspace, make repair section more prominent:
- Wrap in a Card with colored left border (`border-l-4 border-primary`)
- Header: "Reparaciones · N items" with subtotal prominently shown
- "Agregar reparación" button larger

In right panel, add a persistent financial summary card (always visible, not just when contractor selected):
- Presupuesto cliente total
- Costo contratista total (if contractor selected)
- Utilidad estimada (if contractor selected)  
- Section subtotal for active section

### E. Signature as compliance block (minor refinement)
Already implemented as separate card in sidebar. Add signer name display when signed, and `signed_at` timestamp.

---

## Files Summary

| Action | File |
|---|---|
| Rewrite | `src/pages/executive/ExecutiveReviewQueue.tsx` — KPIs, filters, inspector filter, calendar, contextual CTAs |
| Edit | `src/pages/executive/ExecutiveReviewDetail.tsx` — blocker bar, sidebar indicators, photo gallery, financial cards |

2 file changes. No migrations.

