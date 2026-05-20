
# Homie Inspection — Executive UX + Structural Refinement

Incremental, production-safe pass. No DB-breaking changes, no routing changes, no rewrites. Reuses existing services, RLS, storage, upload pipeline, and design tokens. Each commit ships independently.

---

## Commit 1 — Contextual repairs surface + payer hierarchy

**Files:** `src/pages/executive/ExecutiveReviewDetail.tsx`, `src/components/QuotationDialog.tsx`.

- Convert repair create/edit and repair-catalog browser from centered `Dialog` to right-side `Sheet` (~`w-[480px]`, scrollable, footer with primary CTA).
- For dialogs that must stay centered (publish, confirm), override `SheetOverlay`/`DialogOverlay` to `bg-black/10 backdrop-blur-[1px]` (or `bg-transparent` where readability allows). Keep focus trap + ESC.
- Default `payer_role = 'tenant'` for newly created repair rows (currently `'owner'` at line 313).
- Replace payer dropdown + inline DropdownMenu (lines ~1642–1648) with `ToggleGroup type="single"` (`h-10 px-4 text-sm font-medium`), Inquilino / Propietario, primary fill on selected, neutral surface unselected. Same control reused in editor row and inline list.
- Repair row scanability: increase row padding, separate title / contractor price / payer / category with stronger horizontal rhythm.

**Acceptance:** observations + photos readable while editing repairs; tenant preselected; payer toggle visually dominant; no keyboard regressions.

---

## Commit 2 — Autosave final observations

**New file:** `src/shared/hooks/useDebouncedAutosave.ts`.

- Generic hook: `useDebouncedAutosave(value, saveFn, delay=1200)` returns `{ status: 'idle'|'saving'|'saved'|'error', flush() }`.
- Apply to executive `final_observation` per section + executive internal note in `ExecutiveReviewDetail.tsx`.
- Tiny muted helper text under each textarea: `Guardando…` → `Guardado automáticamente`. No toasts. No blocking spinners. Remove "Guardar observación" buttons (keep silent flush-on-blur).
- Flush pending save on unmount, on route change (cleanup), and on `beforeunload`.
- Guard against duplicate concurrent saves (in-flight token) and stale overwrites.

**Acceptance:** typing never blocks; refresh preserves content; route changes don't lose pending text; no duplicate requests.

---

## Commit 3 — Photo workflow upgrade

**Files:** photo grid section of `ExecutiveReviewDetail.tsx`, reuse `PhotoUploadSheet`, `getSignedPhotoUrl`, `useSignedPhotoUrls`.

- Grid: `grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3`; tile `w-full aspect-square object-cover rounded-xl`.
- Hover/tap overlay per tile: Expand (Lightbox) + Delete (`Trash2`). Delete uses existing `inspection_photos` delete path (executive RLS already covers update; add a single executive DELETE policy migration only if missing — verify first via read_query).
- Per-section "Subir foto" CTA reuses existing `PhotoUploadSheet`. No parallel uploader.
- Lightbox: shadcn `Dialog` over section photos with prev/next + optional zoom (`object-contain` + simple scale toggle). Reuse `useSignedPhotoUrls`.
- After upload/delete: react-query invalidate `photos` key for the section so gallery updates instantly.

**Acceptance:** executives upload/delete without reload; gallery updates instantly; responsive across breakpoints; signed URL pipeline unchanged.

---

## Commit 4 — Schedule executive filter + queue cleanup

**Files:** `src/pages/executive/ExecutiveSchedule.tsx`, `src/pages/executive/ExecutiveReviewQueue.tsx`.

- Schedule: add second filter "Todos los ejecutivos" sourced from `profiles.role = 'executive'` (existing RLS policy already allows this for executives). Render as `Combobox` (Command) with initials avatar + name.
- Persist both filters in URL: `?exec=<id>&inspector=<id>`; restore on mount.
- Filtering applies to inspections by `executive_id` / `inspector_id` independently.
- Queue: audit and remove any "X observaciones pendientes" / warning count badges from row cards. Keep `StatusBadge` + progress label + CTA only.

**Acceptance:** both filters compose; URL state survives navigation; queue cards visually quieter.

---

## Commit 5 — Contrast / hierarchy correction pass

**Files:** `src/index.css`, `tailwind.config.ts`, sidebar + schedule + queue.

- Bump (HSL only):
  - `--sidebar-foreground`, `--sidebar-accent-foreground` toward higher contrast; selected nav item gets stronger surface.
  - `--muted-foreground` slightly darker.
- Sweep replace `text-muted-foreground/50` → `text-muted-foreground` on hour labels, dates, metadata, contextual chips.
- Calendar grid borders `border-border/30` → `border-border/70`.
- Page titles + active filter chips: bump weight and foreground.
- Explicitly NOT: harsh borders everywhere, saturation bumps, dark surfaces, rollback of soft aesthetic.

**Acceptance:** metadata readable without zoom; sidebar selection unmistakable; calendar grid scannable; soft aesthetic preserved.

---

## Commit 6 — VAT audit + shared money primitives

Schema already in place (`market_tax_settings` table, `applyVat` in `src/lib/tax.ts`). No new migration unless audit finds gaps.

- New shared primitives in `src/shared/ui/`:
  - `MoneyDisplay` — currency formatting consistent with market.
  - `TaxBreakdown` — subtotal / label+% / total rows.
- Wire `TaxBreakdown` into `QuotationDialog`, printable quotation view, and `OwnerReport`. Confirm published payload snapshots the VAT config so reissued public reports stay stable.
- Verify operational surfaces (executive totals in `ExecutiveReviewDetail`, repair editor, inspector flows, admin dashboard) remain net-only — no `applyVat` calls.

**Acceptance:** every quotation/public report shows consistent VAT; operational screens unchanged; published reports immutable.

---

## Commit 7 — Repairs module extraction + hooks

**New:** `src/modules/repairs/` (api + components), `src/modules/quotation/`, `src/modules/report/`.

- Extract from `ExecutiveReviewDetail.tsx` into services + react-query hooks:
  - `useRepairItems(inspectionId)` — list / create / update / delete.
  - `usePublishReport(inspectionId)` — dual owner+tenant publish flow.
  - `usePhotoUpload(sectionId)` — wrapper over existing upload + invalidation.
- Move repair list + editor UI into `src/modules/repairs/components/` (imported back by the page; route stays).
- Centralize status registry usage in repairs/quotation via existing `src/shared/ui/status-registry.ts`.
- Page-level imports stay backward compatible. `ExecutiveReviewDetail.tsx` shrinks but its route is untouched.

**Acceptance:** no inline `supabase.from()` for repairs/photos/publish in the page; react-query keys deterministic; no behavior drift.

---

## Commit 8 — Chile catalog import (one-off script)

Out-of-app data task; runs once when the user supplies the Excel.

- Script reads Excel: `Partidas`, `HOMIE Rent S/IVA`, contractor columns.
- Normalize names: lowercase + trim + collapse spaces. No fuzzy matching.
- Per row: upsert into `repair_catalog_items` matched by normalized name + `market='CL'`. Update `base_price` unless incoming = 0 (skip; never overwrite valid prices with 0).
- Per contractor column: upsert into `repair_catalog_item_contractor_prices` keyed by `(contractor_id, repair_catalog_item_id)`.
- Ambiguous matches → log + skip; print summary at end (created / updated / skipped / ambiguous).

**Acceptance:** catalog populated; no duplicate contractor rows; valid prices preserved; ambiguous items reported.

---

## Out of scope (explicit)

- No global state library, no shadcn or Supabase replacement, no routing changes.
- No new design tokens beyond contrast bumps in commit 5.
- No inspector flow rewrite.
- No new upload or signed-URL pipeline.
- No autonomous AI; architecture stays AI-ready but no AI features ship here.

---

## Technical notes

- React-query keys live in `inspectionKeys` (already exists); repairs/photos extend the same factory.
- Autosave hook stores last-saved value to skip no-op saves; tracks an `inFlightId` to drop stale responses.
- Sheet conversion keeps existing form state hooks — only the wrapper changes.
- Photo delete: confirm executive DELETE policy on `inspection_photos` exists (current schema only shows inspector DELETE). If absent, single additive RLS migration in commit 3:

```sql
CREATE POLICY "Executives can delete photos of assigned inspections"
ON public.inspection_photos FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.inspections i
  WHERE i.id = inspection_photos.inspection_id AND i.executive_id = auth.uid()));
```

- Contrast pass touches only token values + a class sweep; no component restructure.

