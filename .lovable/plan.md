

## Plan: Final `typology` purge (defensive cleanup)

### Audit findings

I searched the entire codebase. **No code currently writes `typology` as a column on the `inspections` table.** The remaining references are all safe:

| Location | Usage | Safe? |
|---|---|---|
| `src/lib/inspection-service.ts` insert into `inspections` | does NOT include `typology` | ✅ already clean |
| `src/pages/admin/AdminInspectionDetail.tsx` updates | only inspector_id, executive_id, status, contractor_id, property_overrides_json, dates | ✅ |
| `src/pages/admin/AdminInspectionDetail.tsx` `PropertyOverrideEditor` | bedrooms, bathrooms, tower, parking, storage | ✅ |
| `src/pages/inspector/InspectorInspectionDetail.tsx` | only `property_overrides_json` | ✅ |
| `src/pages/executive/ExecutiveReviewDetail.tsx` | status, contractor_id, published_at, approved_at | ✅ |
| `src/lib/inspection-generator.ts` `normalizePropertySnapshot` | writes `typology` into a **JSON** object → goes to `property_snapshot_json`, not the column | ✅ per ADR-001 |
| `EXAMPLE_PAYLOADS` | seed data with `typology` JSON key | ✅ snapshot only |
| `src/pages/public/OwnerReport.tsx` | reads `typology` from snapshot JSON for display | ✅ |
| `src/lib/types.ts` `PropertyPayload.typology` | input type only | ✅ |
| `src/integrations/supabase/types.ts` | column already absent | ✅ |

So the runtime error is most likely **PostgREST schema cache staleness** after the recent column drop, not an active write site in code.

### Defensive hardening (so this can never recur)

To make the cleanup bulletproof and prevent any future accidental write, I'll go one step further than required and remove `typology` from every code surface — including the JSON snapshot keys — keeping only legacy display fallback in OwnerReport for older snapshots stored before the cleanup.

### Changes

1. **`src/lib/types.ts`** — Remove `typology?: string` from `PropertyPayload`. (Forces TS errors on any future write attempt.)

2. **`src/lib/inspection-generator.ts`**
   - Remove `typology: payload.typology` from `normalizePropertySnapshot`'s returned object.
   - Remove the `typology` legacy fallback in `normalizeIncomingPayload` (since `property_type` is now mandatory).
   - Remove the `typology` keys from all `EXAMPLE_PAYLOADS`.

3. **`src/pages/public/OwnerReport.tsx`**
   - Keep the `typology` field on the local `Property` type (with `string | null`) so older published snapshots that still have the JSON key continue to render.
   - Keep the parenthetical fallback rendering.
   - Add a comment explaining this is purely a legacy-snapshot reader, never a writer.

4. **`src/pages/admin/AdminSettings.tsx`** — Update the `DEPRECATED_FLAGS` entry for `typology` to clarify the field is now fully removed from new inspections (kept only as a doc note for legacy snapshots).

5. **PostgREST schema cache** — A column drop sometimes requires PostgREST to reload its schema cache. To force this, run a no-op migration with `NOTIFY pgrst, 'reload schema';` so the API picks up that the column is gone. This is the actual root cause of the runtime error.

### Files touched

| File | Change |
|---|---|
| `src/lib/types.ts` | drop `typology` from `PropertyPayload` |
| `src/lib/inspection-generator.ts` | drop `typology` from snapshot writer, fallback, and EXAMPLE_PAYLOADS |
| `src/pages/public/OwnerReport.tsx` | comment-only clarification, keep legacy-snapshot read |
| `src/pages/admin/AdminSettings.tsx` | clarify deprecation note |
| `supabase/migrations/<ts>_pgrst_reload.sql` | `NOTIFY pgrst, 'reload schema';` (1-line migration) |

### Deliverable summary

- **Where typology was still referenced as a DB column**: nowhere in current source. The runtime error is PostgREST schema-cache staleness.
- **What will be removed**: `PropertyPayload.typology` type, snapshot-JSON write of `typology`, EXAMPLE_PAYLOADS `typology` keys, `normalizeIncomingPayload`'s `typology` fallback.
- **Where typology survives**: only as an optional read inside `OwnerReport.tsx` against legacy snapshot JSON (no DB column read, no write anywhere).
- **Error resolution**: schema-cache reload migration forces PostgREST to re-read the schema and stop reporting the missing column.

