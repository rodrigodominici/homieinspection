

# Plan: Canonical Supabase migration — final refinements

## Refinement 1 — Pre-drop `typology` sweep (mandatory before migration)

Before the `ALTER TABLE ... DROP COLUMN typology` runs, execute a code sweep:
- `grep -rn "typology" src/ supabase/` to locate every read/write.
- Confirm only these surfaces remain: type definitions (`@deprecated` JSDoc), normalization fallback in `normalizeIncomingPayload`, snapshot writer (`property_snapshot_json.typology` legacy informational), and the public report display (parenthetical secondary).
- Confirm RPCs: `get_published_report` returns `normalized_payload` as-is; the payload may contain `typology` inside the snapshot but that is JSON, not a column read. No RPC SELECTs the column directly.
- Confirm `inspection-service.ts` no longer writes `typology` to the `inspections` table column (it currently does — line ~76 of the service inserts `typology: payload.typology`). **This must be removed in the same code change before the column drop.**

Only after the sweep passes do we ship the migration that drops the columns from `inspections` and `inspection_templates`. The JSON-stored legacy `typology` inside `property_snapshot_json` stays untouched (informational).

---

## Refinement 2 — Staged `public_url` transition (kept as proposed)

Phase A (this iteration):
- App stops writing `public_url` on photo insert.
- App stops reading `public_url`; all reads go through `createSignedUrl(storage_path, 3600)`.
- Column kept in DB. Existing rows untouched.

Phase B (future, after signed-URL flow validated in QA):
- Separate migration: `ALTER TABLE inspection_photos DROP COLUMN public_url;`

This iteration ships Phase A only.

---

## Refinement 3 — Signed URL design for `get_published_report`

Behavior change to the existing RPC:

- **Auth gate**: unchanged. The `public_token` + `property_id` pair remains the sole authorization check. No token → no payload → no URLs. RLS is bypassed via `SECURITY DEFINER` only after the token match succeeds.
- **TTL**: signed URLs valid for **3600 seconds (1 hour)**. Each call to `get_published_report` regenerates fresh URLs, so a tenant refreshing the page always gets a working set.
- **Mechanism**: inside the RPC, after fetching `normalized_payload`, walk the embedded photo entries and for each `storage_path` call `extensions.url_encode` + sign using `storage.sign_url(bucket, path, ttl)` (or compose the signed URL via the storage schema's signing helper). Replace each photo's URL field in the payload with the signed URL before returning.
- **Function volatility**: change from `STABLE` to `VOLATILE` because URL signing is non-deterministic per call.
- **Failure mode**: if a `storage_path` cannot be signed (object missing), return `null` for that photo's URL — the report renderer already tolerates missing images.
- **No change** to bucket policy from the RPC's perspective: the bucket flips to private, and the RPC's signed URLs are the only public read path.

Documented inline in the migration file as a header comment.

---

## Refinement 4 — Storage cleanup stays outside migrations

Object deletion under `inspections/` prefix runs as a **separate Node script** (`scripts/qa-storage-wipe.ts`), invoked manually by an operator using the service role key. It is not part of any SQL migration.

The script:
1. Lists objects in `inspection-photos` bucket recursively.
2. Filters to paths starting with `inspections/`.
3. Calls `storage.from('inspection-photos').remove(paths)` in batches of 100.
4. Logs total deleted count.

Rationale: SQL migrations should not perform side effects against the storage API; they must remain idempotent and reversible at the schema level.

---

## Refinement 5 — Architecture Decision Record

Create `docs/ADR-001-canonical-architecture.md` documenting the five canonical decisions:

```
# ADR-001: Canonical Operational Architecture

Status: Accepted (QA phase)
Date: 2026-04-17

## Decisions

1. property_type is the SOLE source of truth for property classification.
   Canonical values: 'estudio', 'departamento', 'casa'.
   All conditional generation logic reads only this field.

2. typology is REMOVED from the relational schema.
   - Dropped from `inspections` and `inspection_templates`.
   - May persist inside `property_snapshot_json` as legacy informational data.
   - No new code may consume it for business logic.

3. inspection-photos bucket is PRIVATE.
   - No anonymous reads.
   - Authenticated app reads use `createSignedUrl(path, 3600)`.
   - Public reports receive signed URLs through `get_published_report`,
     gated by the `public_token + property_id` pair.

4. storage_path is the CANONICAL asset reference.
   - `inspection_photos.public_url` is deprecated.
   - App stops writing it now; column dropped in a later migration after
     signed-URL flow is validated.
   - Path convention: `inspections/{inspection_id}/{section_key}/{uuid}.{ext}`.

5. QA data reset is APPROVED.
   - Wipe scope: inspections, sections, field values, photos (rows + objects),
     signatures, reviews, repair items, report versions, audit log, source events.
   - Preserved: profiles, mappings, repair catalog, contractors, templates.
   - Storage objects under `inspections/` removed via separate Node script,
     not via SQL migration.
```

---

## Execution order (5 deliverables)

| # | Deliverable | Type |
|---|---|---|
| 1 | `docs/ADR-001-canonical-architecture.md` | Doc |
| 2 | Code sweep + remove `typology` writes from `inspection-service.ts`; remove `public_url` writes from photo upload paths; switch all photo reads to `createSignedUrl` | Code |
| 3 | Migration `<ts>_canonical_cleanup.sql`: drop `typology` columns, flip bucket to private, add `storage.objects` RLS, replace `get_published_report` (volatile, signed URLs, 1h TTL, token-gated) | SQL migration |
| 4 | Migration `<ts>_qa_wipe.sql`: delete inspection-domain rows in dependency order | SQL migration |
| 5 | `scripts/qa-storage-wipe.ts`: standalone Node script for storage object cleanup | Script |

No drop of `inspection_photos.public_url` in this iteration. No FK additions. No new tables.

