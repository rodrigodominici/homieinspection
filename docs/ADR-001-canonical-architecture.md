# ADR-001: Canonical Operational Architecture

Status: Accepted (QA phase)
Date: 2026-04-17

## Decisions

1. **`property_type` is the SOLE source of truth for property classification.**
   Canonical values: `'estudio'`, `'departamento'`, `'casa'`.
   All conditional generation logic reads only this field.

2. **`typology` is REMOVED from the relational schema.**
   - Dropped from `inspections` and `inspection_templates`.
   - May persist inside `property_snapshot_json` as legacy informational data.
   - No new code may consume it for business logic.

3. **`inspection-photos` bucket is PRIVATE.**
   - No anonymous reads.
   - Authenticated app reads use `createSignedUrl(path, 3600)`.
   - Public reports receive signed URLs through `get_published_report`,
     gated by the `public_token + property_id` pair.

4. **`storage_path` is the CANONICAL asset reference.**
   - `inspection_photos.public_url` is deprecated.
   - App stops writing it now; column dropped in a later migration after
     signed-URL flow is validated.
   - Path convention: `inspections/{inspection_id}/{section_key}/{uuid}.{ext}`.

5. **QA data reset is APPROVED.**
   - Wipe scope: inspections, sections, field values, photos (rows + objects),
     signatures, reviews, repair items, report versions, audit log, source events.
   - Preserved: profiles, mappings, repair catalog, contractors, templates.
   - Storage objects under `inspections/` removed via separate Node script
     (`scripts/qa-storage-wipe.ts`), not via SQL migration.

## Signed URL design (`get_published_report`)

- Function is `VOLATILE SECURITY DEFINER`.
- Auth gate: `public_token` + `property_id` only.
- Walks `normalized_payload.sections[].photos[]` and replaces each `url` with a
  fresh signed URL derived from `inspection_photos.storage_path`.
- TTL: 3600s (1h). Each call regenerates fresh URLs.
- Missing/unsignable objects yield `url = null`; the renderer tolerates it.
