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

## Addendum — decisions accepted after 2026-05 (reviewed 2026-08-27)

6. **Status vocabulary is type-agnostic and centralized.**
   `src/shared/ui/status-registry.ts` is the only source of labels and
   tones. No label may reference "check-out" (both `check_out` and
   `captacion` share the same states). Wording per inspection type comes
   from `src/lib/inspection-type-labels.ts`.

7. **`quien_repara` is a flag, not a status.**
   Values `homie | dueno | ninguno`. Editable **only** inside the
   "Finalizar inspección" action; read-only everywhere else. Changes are
   audited by the `log_quien_repara_change` trigger.

8. **Operational close is an explicit action.**
   `public.finalize_inspection` moves `approved` / `accepted` /
   `published+accepted` inspections to `sent` ("Finalizado"), requires
   `quien_repara`, and is allowed for Admin and Executive. `sent` always
   wins over the owner-feedback lifecycle in bucket derivation.

9. **KPIs and list filters derive from one module.**
   `src/lib/inspection-buckets.ts` feeds Admin lists, dashboards and the
   executive queue. KPI clicks reset conflicting filters (unified
   filtering axis).

10. **`comercial` is a read-only role.**
    Access is enforced in the database via `public.is_comercial()` and
    `public.is_visible_checkout_for_comercial()`; the UI only consults and
    downloads published check-outs.

11. **Resilience baseline.**
    Auth resolution has a 6 s timeout with a `BackendUnavailable` fallback;
    route chunks use `lazyWithRetry`; a build-time `version.json` plus
    `NewVersionPrompt` prevent stale PWA bundles; `health-check` +
    `system_health_state` back outage alerting; client errors land in
    `client_error_log` and PostHog.

12. **RLS policies must use InitPlan subselects.**
    Write `(select auth.uid())`, never bare `auth.uid()`, so policies stay
    index-friendly on large tables.

13. **Photo access is batch-signed.**
    Signed URLs are requested in batches with a 1 h TTL and refreshed at
    ~50 min. Images are compressed to JPEG (max 1600px) client-side, and
    uploads refresh the JWT before retrying on 400/401.

14. **Deleting an inspection deletes its source events.**
    Otherwise intake deduplication blocks re-ingesting the same payload.
