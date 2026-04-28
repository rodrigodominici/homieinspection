
# Executive budget UX + public images fix

Two independent problems handled separately.

---

## Part 1 — Diagnosis: Executive budget UI

**Why the current placement creates friction**

In `ExecutiveReviewDetail.tsx` (`SectionWorkspace`), each section renders a long vertical sequence:
status fields → other fields → side-by-side observations → internal note → **Reparaciones card** → return mode.

The repairs block sits at the very bottom of the section. To budget a repair the executive must:

1. Scroll past observations and the internal note.
2. Add/edit the repair.
3. Scroll back up to re-read the observation or check a photo in the right rail.
4. Repeat for each repair.

The right rail already shows photos for the active section, but repairs are forced into the same vertical column as text content, so review (text + photos) and budgeting (numbers + classification) compete for the same scroll axis. Each repair card is also tall (~6 rows: title, description textarea, pricing grid, notes, payer/nature row), which compounds the scroll problem when a section has 3+ items.

**How much is "just stacking"**

Most of it. The card itself is reasonable; the issue is that it's stacked below content the executive needs to keep referencing. Moving it to a parallel surface eliminates the scroll loop without redesigning the card.

**Inline vs secondary surface**

A right-side drawer is the right call:

- preserves "repairs belong to a section" (drawer is opened from the active section header)
- text review stays anchored in the center column
- photos stay in the right rail until the drawer opens, drawer overlays the rail
- closing returns the executive to the exact same scroll position
- no data model change

---

## Part 1 — Implementation

### New component: `SectionRepairsDrawer`

A right-side `Sheet` (reuses existing `@/components/ui/sheet`) opened per active section. Contents:

- header: section title + repair count + section subtotal (cliente)
- "Agregar reparación" button → opens existing catalog sheet stacked on top
- compact list of repairs, each rendered as a **collapsed summary row** by default:
  - title · payer chip · nature chip · subtotal · expand caret · delete
- click a row → expands inline to show the full editor (description, qty/precio/contratista grid, notes, visibility toggle, payer/nature dropdowns)
- only one repair expanded at a time (accordion behavior)
- empty state: "Sin reparaciones en esta sección" + primary "Agregar"
- footer (sticky inside the drawer): subtotal cliente + count

The full editing UI itself is the same controls already in `SectionWorkspace`'s repair card — just relocated and collapsed-by-default.

### Trigger placement

In `SectionWorkspace`, replace the entire bottom `Reparaciones` card with a **compact summary strip** placed near the top of the section (right after the section title row):

```
[Wrench] Reparaciones · 3        Subtotal $45.000   [Editar reparaciones ▸]
```

- Click the row or the button opens the drawer.
- Strip stays visible after closing, with updated count/subtotal.

This satisfies "repair editor moves out of the bottom" and gives the executive a one-click path to budget without scrolling.

### Mobile

Mobile already has the budget per section in a stacked layout (line ~911). Keep the existing inline behavior on mobile (drawer would compete with the bottom action bar). The drawer is desktop-only (`hidden lg:flex` trigger; on mobile keep the current inline list). The compact summary strip can render on both.

### What does NOT change

- data model, RLS, RPC, publish flow
- catalog sheet, contractor popover
- subtotal logic (`budgetBreakdown`, `clientTotal`, `contractorTotal`)
- right photo rail (drawer overlays, doesn't replace)

---

## Part 2 — Diagnosis: missing public images

**End-to-end trace**

1. Publish payload (`handlePublish`, line 362) writes `photos: [{ id, url: null, caption }]` — `url` is intentionally null; the RPC is supposed to fill it.
2. The RPC `get_published_report` walks each photo and tries:
   ```sql
   SELECT (storage.sign(v_storage_path, 3600, 'inspection-photos')) INTO v_signed_url;
   ```
3. **`storage.sign` does not exist.** Verified via `pg_proc`: no function named `sign` in `storage`, `extensions`, or `public`. The call raises `undefined_function`, the `EXCEPTION WHEN OTHERS` block swallows it, `v_signed_url` stays NULL.
4. RPC returns `{ id, url: null, caption }`.
5. `OwnerReport.tsx` renders `<img src={photo.url ?? ''} />` → empty `src` → browser shows broken-image icon.

**Scope:** affects 100% of published reports, both audiences, all sections — every photo.

**Why a client-side `createSignedUrl` retry won't work**

The bucket is private and storage RLS only allows authenticated roles to SELECT inspection photos. Public report viewers are anonymous. Direct anon `createSignedUrl` will be denied.

---

## Part 2 — Implementation

### New edge function: `sign-public-photo`

Public (no JWT). Inputs: `{ property_id, token, photo_id }`.

Logic (uses `SUPABASE_SERVICE_ROLE_KEY`):

1. Look up `inspection_report_versions` row by `public_token` where `status = 'published'` AND `is_latest = true`.
2. Join `inspections` and verify `property_id` matches.
3. Verify the requested `photo_id` belongs to that `inspection_id` via `inspection_photos`.
4. Read `storage_path` and call `storage.from('inspection-photos').createSignedUrl(path, 3600)` with the service-role client.
5. Return `{ url }` (or 404). Cache headers: `Cache-Control: private, max-age=3000`.

Add `[functions.sign-public-photo] verify_jwt = false` in `supabase/config.toml`.

### Renderer changes (`OwnerReport.tsx`)

- New helper `usePublicSignedPhotoUrls(photos, propertyId, token)`:
  - Mirrors the shape of `useSignedPhotoUrls` but calls the edge function per id, batched in parallel via `Promise.all`.
  - Caches in component state; refreshes when `photos` change.
- Replace `<img src={photo.url ?? ''} />` with `<img src={urlOf(photo.id)} />`.
- Graceful fallback: if a URL resolves to empty, render a neutral placeholder block (`bg-muted` square with a small "Foto no disponible" caption) instead of a broken-image icon. Use `onError` on the `img` to swap to the placeholder if the signed URL itself 404s.

### RPC cleanup

- Strip the broken `storage.sign(...)` block from `get_published_report` so the RPC no longer wastes work pretending to sign URLs. Keep the photo entry shape `{ id, url: null, caption }` so the renderer's contract is unchanged: it always signs via the edge function.

### Why not just fix the RPC

`storage.create_signed_url` is not exposed as a SQL-callable function in Supabase. The supported path for signing from a privileged context is the storage HTTP API, which the edge function calls cleanly. Doing it in an edge function also gives us the auth check (token + property_id + photo ownership) in one place.

---

## Files affected

**Part 1**
- `src/pages/executive/ExecutiveReviewDetail.tsx` — extract `SectionRepairsDrawer`, replace bottom repairs card with compact summary strip + drawer trigger.

**Part 2**
- `supabase/migrations/<new>.sql` — replace `get_published_report` body to drop the broken `storage.sign` block.
- `supabase/functions/sign-public-photo/index.ts` — new public edge function.
- `supabase/config.toml` — add `[functions.sign-public-photo] verify_jwt = false`.
- `src/pages/public/OwnerReport.tsx` — new `usePublicSignedPhotoUrls` hook, swap img sources, add image fallback.

---

## Out of scope

- No change to the inspection / repair / publish data model.
- No change to RLS on `storage.objects`.
- No change to the audience filtering contract.
- No change to admin-side publishing flow (it already produces the same payload shape, so it inherits the image fix automatically).
