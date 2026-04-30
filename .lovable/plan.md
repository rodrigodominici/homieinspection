
# Outbound HubSpot Sync — Manual Retry + Failure Classification (Refined)

Mirror the inbound `retry-source-event` pattern for outbound syncs: classify failures, expose a manual retry button in the outbound logs UI (primary surface), with a secondary CTA on inspection detail. No automatic retry yet.

---

## 1. Failure classification (single source of truth)

To prevent server/client drift, the vocabulary lives in **one shared module** that is imported by both runtimes.

- Canonical file: `src/lib/hubspot-retry-classifier.ts` — pure TS, zero imports, exports:
  - `type RetryClass = 'retryable' | 'non_retryable' | 'not_failed'`
  - `RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504])`
  - `NON_RETRYABLE_ERROR_PREFIXES` (exact strings/prefixes — see below)
  - `RETRYABLE_ERROR_PATTERNS` (substrings: `request_failed`, `timeout`, `econn`, `fetch failed`, `network`)
  - `classifyOutboundFailure(row: { status; response_status; error_message }): RetryClass`
- Edge function consumption: `supabase/functions/retry-hubspot-sync/index.ts` imports it directly via a relative path:
  ```ts
  import { classifyOutboundFailure } from '../../../src/lib/hubspot-retry-classifier.ts';
  ```
  Deno resolves the `.ts` file. No duplication, no drift possible.
- A small parity test (`src/test/hubspot-retry-classifier.test.ts`) locks the matrix:
  - skipped → `not_failed`
  - success → `not_failed`
  - `error` + `response_status=429` → `retryable`
  - `error` + `response_status=503` → `retryable`
  - `error` + `error_message='request_failed: …'` → `retryable`
  - `error` + `error_message='hubspot_private_app_token_missing'` → `non_retryable`
  - `error` + `error_message='no_active_external_reference'` → `non_retryable`
  - `error` + `response_status=400` → `non_retryable`

**Non-retryable vocabulary** (matched against `error_message` exact or prefix):
`unauthorized:`, `invalid_json`, `missing_inspection_id`, `invalid_action:`, `hubspot_private_app_token_missing`, `inspection_not_found:`, `missing_key_date`, `invalid_event_time`, `no_active_external_reference`, `invalid_external_object_id:`, `reference_lookup_failed:`. Plus any HubSpot HTTP `4xx` other than `408/425/429`.

**Retryable**: HTTP statuses in `RETRYABLE_HTTP_STATUSES` OR `error_message` matches a `RETRYABLE_ERROR_PATTERNS` substring.

`status='skipped'` and `status='success'` rows always classify as `not_failed` — explicitly excluded from retry.

---

## 2. Retry bookkeeping lives on the ORIGINAL failed row

Migration adds these columns to `hubspot_sync_log`:

```sql
ALTER TABLE public.hubspot_sync_log
  ADD COLUMN retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN retry_attempts_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN retried_to_log_id uuid NULL,
  ADD COLUMN retried_from_log_id uuid NULL;
```

Semantics — explicit and per-row, NOT global state:

- **On the original failed row** (the one the admin clicks "Reintentar" on):
  - `retry_count` increments by 1 each time that specific row is retried.
  - `retry_attempts_json` appends `{attempted_at, attempted_by, outcome, new_log_id}` for that row.
  - `retried_to_log_id` is updated to point at the most recent retry's new log row.
- **On the new log row** (produced by the retry invocation of `hubspot-update-inspection`):
  - `retried_from_log_id` is set to the original row's id.
  - `retry_count` / `retry_attempts_json` start at `0` / `[]` — they are local to that row.
  - If THAT new row also fails and is retried, its own counters increment independently.

This keeps each chain link auditable in isolation. There is no per-`(inspection_id, action)` global counter — that would conflate unrelated business events (e.g., a key-date corrected three months apart). The retry cap of `5` is enforced against the originating row's `retry_count`.

---

## 3. `checkout_received` retries — `event_time` source of truth

The original event time MUST be preserved across retries so HubSpot's business event time stays consistent with `inspection_completed_at`. The resolution order, in priority:

1. **`hubspot_sync_log.event_time`** of the original failed row. Already populated on every existing log row (the current function writes it on every exit path including errors). This is the authoritative source for retries.
2. **Fallback** if the original log row has `event_time = NULL` (legacy rows or rows that failed before event_time was derived): re-derive from `inspections.inspection_completed_at`. The retry function logs `event_time_source: 'inspection_completed_at_fallback'` in the new log row's `request_payload` for traceability.
3. **Hard refusal** if both are NULL: return `409 missing_event_time_for_retry` and do NOT call HubSpot. The classifier already marks `invalid_event_time` as non-retryable, so this state is reached only via legacy data — we surface it explicitly instead of silently stamping `now()`.

For `key_collection_date`, no `event_time` is needed from the caller — `hubspot-update-inspection` re-derives the date from `property_overrides_json` / `property_snapshot_json` on every invocation, so retries naturally pick up corrected data.

---

## 4. Edge function: `retry-hubspot-sync`

`verify_jwt = false`, JWT validated in code via `getClaims` + `profiles.role='admin' AND is_active=true`.

Flow:
1. Body: `{ log_id }`. Load row.
2. Refuse cases (HTTP code in parens):
   - row not found (404)
   - `classifyOutboundFailure(row) !== 'retryable'` → 409 `non_retryable` with reason
   - `retry_count >= 5` → 400 `retry_limit_reached`
   - missing `inspection_id` or `action` on the row → 409 `incomplete_log_row`
   - `action='checkout_received'` and step 3 below resolves to no event_time → 409 `missing_event_time_for_retry`
3. Resolve `event_time` per section 3.
4. Set the original row's `retry_count = retry_count + 1` and append a provisional attempt entry (outcome = `pending`).
5. Invoke `hubspot-update-inspection` internally (service-to-service fetch with admin's bearer token forwarded so the inner function's user check passes; admin role already validated upstream). Pass body:
   ```json
   { "inspection_id": "...", "action": "...", "event_time": "...", "triggered_retry_from": "<original_log_id>" }
   ```
6. Read the new log row id and outcome from the inner function's response.
7. Update the original row: set `retried_to_log_id`, finalize the appended attempt entry (`outcome = 'completed' | 'failed'`, `new_log_id`).
8. Return `{ status, new_log_id, new_status }`.

Additive change to `hubspot-update-inspection`: accept optional `triggered_retry_from` body field; copy verbatim to the inserted log row's `retried_from_log_id`. All existing callers unaffected.

Register in `supabase/config.toml`:
```toml
[functions.retry-hubspot-sync]
verify_jwt = false
```

---

## 5. UI — outbound logs screen is the PRIMARY surface

### A. `AdminIntegrationHubSpotOutboundLogs.tsx` (primary)

- New **"Tipo"** column per row using `classifyOutboundFailure`:
  - `Reintentable` (amber outline badge)
  - `No reintentable` (muted outline badge)
  - `—` for `not_failed`
- New **"Reintentar"** action button on every retryable error row, disabled (with tooltip) when `retry_count >= 5`.
- Loading state per row; on success, refresh and toast `"Reintento creado · log <short id>"` with link.
- Detail `Sheet` additions:
  - If `retried_from_log_id`: link "Reintento de `<short id>`".
  - If `retried_to_log_id`: link "Reintentado como `<short id>`".
  - Render `retry_attempts_json` as a vertical timeline (timestamp, admin, outcome, new log link).
- New filter chip group: `Todos | Reintentables | No reintentables` alongside existing status filter.

### B. `AdminInspectionDetail.tsx` (secondary, deliberately minimal)

A single, low-prominence link — NOT a primary action — appears under each HubSpot trigger button when the most recent `hubspot_sync_log` row for that `(inspection_id, action)` is a retryable error:

> "Última sincronización falló · [Reintentar] · [Ver en logs →]"

Rendered as a small inline alert with `text-xs` and `variant="link"` buttons. The primary "Ver en logs" link routes to `/admin/integrations/hubspot/outbound-logs?inspection=<id>` (requires the existing `search` filter to accept the inspection id; already supported via free-text search).

This intentionally mirrors but does not replace the logs screen — admins triaging a wave of failures should use the logs screen filters, not click into individual inspections.

### C. Shared client helper

`src/lib/hubspot-sync.ts`:
```ts
export function retryHubspotSync(logId: string): Promise<SyncResult> {
  return invoke({ log_id: logId }, 'retry-hubspot-sync');
}
```
(Small refactor: pass function name into `invoke`.)

---

## 6. Out of scope (deferred follow-up)

- **Automatic retry with backoff.** Defer until production data shows which transient errors actually recur and at what cadence. Future shape: a scheduled `recover-stalled-hubspot-syncs` function that picks `error` rows where `classifyOutboundFailure='retryable'` AND `retry_count<5` AND `created_at > now() - interval '24h'`, with exponential backoff keyed on `retry_count`.
- Per-action global retry counters or dedup — current per-row model is sufficient and clearer.
- UI to bulk-retry a filtered set — single-row retry covers the operational need today.

---

## Files

**New**
- `supabase/functions/retry-hubspot-sync/index.ts`
- `src/lib/hubspot-retry-classifier.ts` (shared by edge + UI)
- `src/test/hubspot-retry-classifier.test.ts`
- One Supabase migration (4 columns)

**Modified**
- `supabase/functions/hubspot-update-inspection/index.ts` — accept `triggered_retry_from`, persist to `retried_from_log_id`.
- `supabase/config.toml` — register `retry-hubspot-sync`.
- `src/lib/hubspot-sync.ts` — add `retryHubspotSync` + generalize `invoke`.
- `src/pages/admin/AdminIntegrationHubSpotOutboundLogs.tsx` — classification column, retry button, filter, lineage in sheet.
- `src/pages/admin/AdminInspectionDetail.tsx` — secondary inline retry alert per action.
