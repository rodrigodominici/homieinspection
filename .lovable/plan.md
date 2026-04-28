## Step 1 — Diagnosis

**Current published flow**
- `handlePublish` (Executive) and `handleAdminPublish` (Admin) both build one `normalized_payload` (already includes `payer_role` + `payment_nature` per repair), set `is_latest=false` on prior rows, insert one row in `inspection_report_versions`, and produce one URL `/reportes/:propertyId/:token`.
- `OwnerReport.tsx` is the only public renderer — calls RPC `get_published_report(property_id, token)`, which validates the token and re-signs photo URLs.
- The payload already carries `payer_role` + `payment_nature`; only renderer + link generation need to change.

**Existing reads of `inspection_report_versions` (full audit)**
1. `ExecutiveReviewDetail.tsx:376` — selects max `version_number` for next-version calc. **Safe**: per-audience rows share the same `version_number`, so the max is unchanged.
2. `ExecutiveReviewDetail.tsx:379` and `AdminInspectionDetail.tsx:429` — `update is_latest=false WHERE inspection_id=?`. **Safe**: blanket reset works regardless of audience.
3. `AdminInspectionDetail.tsx:213` — fetches all versions for the "Versiones Publicadas" panel, ordered by `version_number desc`. **Needs update**: must group by `version_number` so each version row collapses both audiences (otherwise list shows duplicate entries).
4. `AdminInspectionDetail.tsx:545` — `getOwnerUrl()` does `versions.find(v => v.is_latest && v.public_token)`. **Needs update**: must filter by `audience='owner'`.
5. `AdminInspectionDetail.tsx:887` — reads `reportVersions[0]` for "Versión actual". **Safe-after-grouping** (point 3): grouped list keeps one entry per version.
6. `AdminInspectionDetail.tsx:365` — cascade delete on inspection deletion. **Safe**: deletes all rows.
7. RPC `get_published_report` — looks up by `(public_token, property_id, status='published', is_latest=true)`. **Safe**: each audience has its own unique token; both rows can be `is_latest=true`.
8. Migration `20260417125232` — uses the same lookup pattern; same safety reasoning.

No other reads exist. After refactor, every consumer either filters by `audience` or treats `version_number` as the grouping key.

**Filtering contract (explicit)**
- **`audience` is the primary public-rendering filter.** It alone decides which payer's items the public view shows.
- **`visible_to_owner` only gates the *owner-published payload*.** A repair hidden via `visible_to_owner=false` is excluded from the published payload entirely (both audience rows). It is an editorial visibility flag, not a payer flag.
- Owner audience renders all payload items grouped by `payer_role`. Tenant audience filters payload to `payer_role==='tenant'` only.
- Conclusion: `visible_to_owner` cannot accidentally hide tenant items the owner needs to see, because both audience rows are built from the same already-filtered visible set. If an executive needs an item explained to the owner regardless of payer, they must keep `visible_to_owner=true` — which is the existing semantic.

**Input contrast issue**
- `Input` and `Textarea` use `border-input` (`220 13% 91%`) on white card sitting on `--background` (`230 25% 97%`). After the cleanup, the borders are nearly invisible. Affected throughout the executive workspace: repair description textareas, internal notes, final observation textareas, return-comment textareas, numeric pricing inputs.

## Step 2 — Implementation

### A. Field contrast (subtle, light)

`src/index.css`
- `--input: 220 13% 91%` → `220 13% 84%` (only form fields tighten; `--border` for separators stays soft).

`src/components/ui/input.tsx` and `textarea.tsx`
- New base classes:
  - `bg-background/60` (subtle gray fill on white card backgrounds)
  - `border-input` (now slightly darker)
  - `hover:border-foreground/30 hover:bg-background`
  - `focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-0`
  - `placeholder:text-muted-foreground/70`
- No shadows. Existing `className` overrides still merge.

### B. Schema migration — `audience` column

```sql
alter table public.inspection_report_versions
  add column audience text not null default 'owner'
  check (audience in ('owner','tenant'));

create index if not exists inspection_report_versions_audience_idx
  on public.inspection_report_versions (inspection_id, audience, is_latest);

create unique index if not exists inspection_report_versions_latest_unique
  on public.inspection_report_versions (inspection_id, audience)
  where is_latest = true;
```

`get_published_report` — add `audience` to the returned JSON so the renderer knows what to filter:
```sql
-- read v_audience in the same SELECT
SELECT irv.normalized_payload, irv.inspection_id, irv.audience
INTO result, v_inspection_id, v_audience
...
result := result || jsonb_build_object('sections', v_new_sections, 'audience', v_audience);
```

### C. Atomic publish flow (Executive + Admin)

Executive `handlePublish` and Admin `handleAdminPublish` both refactored to:
1. Build one `payloadBase` from visible repairs (same set as today; each item already carries `payer_role` + `payment_nature`). Owner payload === tenant payload at the data layer; the renderer applies the audience filter.
2. Compute `nextVersion` (max + 1).
3. `update is_latest=false where inspection_id = ?` (blanket reset).
4. Insert two rows in a single `.insert([...])` call so failures roll back together at the network layer:
   ```ts
   const ownerToken = crypto.randomUUID();
   const tenantToken = crypto.randomUUID();
   const { error } = await supabase.from('inspection_report_versions').insert([
     { inspection_id, version_number: nextVersion, status: 'published',
       audience: 'owner',  public_token: ownerToken,  normalized_payload: payloadBase, is_latest: true },
     { inspection_id, version_number: nextVersion, status: 'published',
       audience: 'tenant', public_token: tenantToken, normalized_payload: payloadBase, is_latest: true },
   ]);
   ```
   On error, surface a toast and abort — the prior `is_latest=false` reset is the only side-effect, which is recoverable on next publish.
5. Update `inspections` row (`status='published'`, timestamps).
6. Open the publish dialog with **both** URLs:
   - `Cotización Propietario` → `/reportes/:propertyId/:ownerToken`
   - `Cotización Inquilino`  → `/reportes/:propertyId/:tenantToken`
   Each row shows a copy button and an open-in-new-tab button. WhatsApp/share buttons reuse the same URL strings.

### D. Updated existing reads

`AdminInspectionDetail.tsx`
- `getOwnerUrl()` → filter by `audience==='owner'` first:
  ```ts
  const ownerLatest = reportVersions.find(v => v.is_latest && v.audience === 'owner' && v.public_token);
  ```
- Add `getTenantUrl()` mirror that filters by `audience==='tenant'`.
- "Versiones Publicadas" panel: group rows by `version_number`, render one entry per version with two copy buttons (`Propietario` / `Inquilino`). Keep "Última" pill on the latest version_number group.
- Header "Versión actual" reads from the grouped list (still valid).

`src/lib/types.ts`
- Add `audience: 'owner' | 'tenant'` to `InspectionReportVersion`.

### E. Audience-aware public renderer (`OwnerReport.tsx`)

Add the comment block at the top of the file:
```ts
/**
 * Audience-aware public report renderer.
 *
 * Despite the historical filename, this component now renders BOTH the owner
 * and tenant published views. It selects rendering rules based on the
 * `audience` field returned by `get_published_report` ('owner' | 'tenant').
 * The route `/reportes/:propertyId/:token` is shared — the audience is
 * resolved server-side from the token, never from the URL.
 */
```

Renderer logic:
- Read `report.audience`.
- **Report tab**: identical for both audiences (sections + observations + photos).
- **Budget tab**:
  - **owner**: two top-level groups
    1. *Reparaciones a cargo del propietario* → `Obligatorias` / `Opcionales`
    2. *Reparaciones a cargo del inquilino* → `Obligatorias` / `Opcionales`
    3. Summary: `Total propietario`, `Total inquilino`, `Total general`
  - **tenant**: only `Reparaciones a cargo del inquilino` (`payer_role==='tenant'`) → `Obligatorias` / `Opcionales` + `Total inquilino`. Owner items are never grouped, totaled, or rendered.
- Helper `flattenRepairs(sections)` returns `{ owner: {required, optional}, tenant: {required, optional} }` keyed off `payer_role` + `payment_nature` from the payload (defaults to `owner` / `required` for legacy payloads).

**Responsiveness**
- Container `max-w-3xl mx-auto px-4 sm:px-6`.
- Header `flex-col sm:flex-row` for identity + meta; meta uses `flex-wrap`.
- Tabs: `grid grid-cols-2`, `sticky top-0 bg-background z-10` so they're reachable on mobile while scrolling.
- Repair rows switch from absolute right-aligned price to `flex-col sm:flex-row sm:justify-between sm:items-start`. On mobile, name+desc stack above price line.
- Numeric values: `font-mono tabular-nums whitespace-nowrap`.
- Photos grid: `grid-cols-2 sm:grid-cols-3` (already there).
- Totals card: stack label/value on `<sm`, side-by-side from `sm:` up.

### F. Files touched

- `src/index.css` (`--input` token)
- `src/components/ui/input.tsx`, `textarea.tsx` (base classes)
- `supabase/migrations/<new>.sql` (audience column + unique index + RPC update)
- `src/lib/types.ts` (`audience` field)
- `src/integrations/supabase/types.ts` (auto-regenerated)
- `src/pages/executive/ExecutiveReviewDetail.tsx` (atomic dual insert + dialog)
- `src/pages/admin/AdminInspectionDetail.tsx` (atomic dual insert + dialog + `getOwnerUrl`/`getTenantUrl` + grouped versions panel)
- `src/pages/public/OwnerReport.tsx` (audience-aware renderer + responsive layout + header comment)

### G. Out of scope this iteration

- Renaming the file/route (kept stable; comment marks it as audience-aware).
- Email/WhatsApp delivery automation (publish dialog only, manual copy).
- Changing `visible_to_owner` semantics (reaffirmed as editorial gate, not payer gate).

## Summary on completion

- **Field contrast**: `--input` darkens slightly; Input/Textarea gain a subtle gray fill, clearer hover, primary focus ring. Placeholders soften to `muted-foreground/70`.
- **Two links**: one publish action writes two rows (owner + tenant) sharing `version_number` + payload, each with its own `public_token`. Dialog exposes both URLs with copy actions; both Executive and Admin publish flows behave the same.
- **Existing reads audited**: `getOwnerUrl`, "Versiones Publicadas" panel, and the version-list header updated; RPC, blanket `is_latest=false` reset, and version-number max query unaffected.
- **Filtering contract**: `audience` is the public rendering filter; `visible_to_owner` remains the editorial visibility gate applied identically for both audience payloads.
- **Owner view**: full report + dual payer budget split with three totals.
- **Tenant view**: full report + tenant-only items + tenant total. Owner figures never reach the tenant render path.
- **Responsiveness**: stacked header, sticky tabs, vertical-on-mobile budget rows, fluid grids, no horizontal scroll.
