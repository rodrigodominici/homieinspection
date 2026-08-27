# ADR-001: Canonical Operational Architecture

Status: Accepted — in production
Date: 2026-04-17 (last reviewed 2026-08-27)

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

## Generator drift (intake stabilization)

Two copies of the inspection structure generator exist:

- **CANONICAL**: `supabase/functions/_shared/inspection-generator.ts` — used by
  the HubSpot intake edge function and any future external webhook.
- **MIRROR**: `src/lib/inspection-generator.ts` — used by the manual flow in
  the client.

Both must produce identical structures for the same payload. A parity test in
`src/test/generator-parity.test.ts` enforces this for the canonical
`departamento 2D/1B` case. When editing one, edit both.

Future consolidation options: (a) build step that copies shared → src at
build time, or (b) extract to a shared internal package. Until then, sync
manually and rely on the parity test.

## Intake failure taxonomy

`inspection_source_events.failure_reason` uses a fixed vocabulary so each
failed event is debuggable without reading SQL:

`payload_validation`, `structure_generation`, `inspection_insert`,
`sections_insert`, `field_values_insert`, `event_update`,
`assignment_resolution`, `unknown`.

`processing_step` (granular marker, written before each operation) records the
last attempted stage even when the SQL exception bubbles up. Deterministic
failures (`payload_validation`, `structure_generation`, SQL-syntax / constraint
errors) are non-retryable and rejected by `retry-source-event` with HTTP 409.
