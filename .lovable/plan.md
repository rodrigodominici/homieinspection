

## Plan: HubSpot intake — final refinements

### 1. Idempotency: split object id vs event id

Two distinct columns on `inspection_source_events`:

| Column | Source | Purpose |
|---|---|---|
| `external_object_id` | HubSpot property/object id (e.g. `hs_prop_12345`) | grouping/search; NOT used for dedup |
| `external_event_id` | HubSpot workflow execution id / message id | **the** idempotency key |

Payload contract updated:
```json
{
  "source": "hubspot",
  "event_type": "inspection.create",
  "payload_version": "v1",
  "external_event_id": "hs_evt_98765",   // required for dedup
  "external_object_id": "hs_prop_12345", // optional, for traceability
  "data": { ... }
}
```

Fallback: if `external_event_id` is absent, derive a deterministic key as `sha256(source|event_type|external_object_id|payload_version|data.property_id|data.inspection_type|truncated_timestamp)` and store it in `external_event_id`. Documented in admin config.

### 2. Single consistent dedup model (no contradiction)

Drop the "insert an `ignored` row for duplicates" idea. Replace with:

- Partial unique index: `UNIQUE (source, external_event_id) WHERE external_event_id IS NOT NULL`.
- Intake flow uses `INSERT … ON CONFLICT (source, external_event_id) DO NOTHING RETURNING id`.
- If no row returned → it's a duplicate. We **do not** insert another row. Instead:
  - fetch the original event row,
  - append a structured entry to its `duplicate_attempts_json` array (`{received_at, request_id, headers_subset}`),
  - increment `duplicate_count`,
  - return `200 {status:'duplicate', original_event_id, original_status}`.
- The Logs view shows duplicates inline on the original row (badge + count + expandable list of replay timestamps), so observability is preserved without violating the unique constraint.

New columns: `duplicate_count integer NOT NULL DEFAULT 0`, `duplicate_attempts_json jsonb NOT NULL DEFAULT '[]'::jsonb`.

### 3. Structured error outcomes

Add `failure_reason text` with a constrained vocabulary, separate from free-form `error_message`:

| `failure_reason` | When |
|---|---|
| `payload_validation` | zod schema fails at intake (row still persisted with raw body for debug) |
| `duplicate` | only used as a transient response label — never stored on a new row (see #2) |
| `normalization` | `normalizeIncomingPayload` / `generateSections` throws |
| `inspection_creation` | RPC insert path fails (DB error, constraint, etc.) |
| `assignment_resolution` | inspector/executive id not found via `external_user_mappings` and required |
| `unknown` | catch-all for unexpected exceptions |

The RPC `create_inspection_from_event` returns a typed result `(inspection_id uuid, failure_reason text, error_detail text)`; the edge function writes both `failure_reason` and `error_message` to the event row. Logs UI filter chips map directly to these reasons.

Status vocabulary stays: `received | processing | completed | failed | ignored`. `ignored` is reserved for explicit business skip cases (e.g. event_type not handled), distinct from duplicate.

### 4. Retry — restricted and guarded

`retry-source-event` edge function (admin JWT required) accepts `event_id` and:

- rejects unless `processing_status = 'failed'`;
- rejects if `failure_reason = 'payload_validation'` (would always re-fail — surfaces a clear toast: "fix payload upstream");
- caps retries with `retry_count integer NOT NULL DEFAULT 0` and a hard limit of 5 (configurable);
- records each attempt in `retry_attempts_json` with `{attempted_at, attempted_by, previous_failure_reason, outcome}`;
- transitions row to `processing` then re-invokes the RPC and updates final state.

UI: retry button visible only on failed rows, disabled when `retry_count >= 5` or `failure_reason = 'payload_validation'`, with tooltip explaining why.

### 5. Background processing resilience

`EdgeRuntime.waitUntil` is the primary async mechanism, but the system is designed so an interrupted background task is recoverable:

- Intake always commits the event row with `processing_status='received'` **before** scheduling the background task. Crash before scheduling → row is still visible.
- Background task first transitions `received → processing` and stamps `processing_started_at`. A row stuck in `processing` for > 5 minutes is considered orphaned.
- A new lightweight scheduled edge function `recover-stalled-events` (invoked manually from admin "Reprocesar pendientes" button for now; cron-ready later) finds rows where `processing_status IN ('received','processing') AND received_at < now() - interval '5 min'` and re-invokes the RPC for each, capped per run. Each pickup increments `recovery_count`.
- Logs UI surfaces a "Atascados" filter so ops can see and recover them with one click.

Result: even if `waitUntil` is killed, the event is never lost — it's visible as `received`/`processing` in admin and recoverable on demand.

### Updated DB column delta

Adds to `inspection_source_events`: `external_event_id`, `external_object_id`, `event_type`, `payload_version`, `normalized_payload_json`, `inspection_id`, `processing_duration_ms`, `processing_started_at`, `failure_reason`, `duplicate_count`, `duplicate_attempts_json`, `retry_count`, `retry_attempts_json`, `recovery_count`. Plus the partial unique index on `(source, external_event_id)`.

### Files unchanged from prior plan

Same file set as the approved plan; only the migration SQL, the intake function logic, the RPC return shape, and the Logs UI columns/filters change to reflect refinements 1–5.

### Summary of refinements applied

1. `external_event_id` (true event id) is the idempotency key; `external_object_id` is metadata only.
2. Duplicates never insert a new row — they update the original via `duplicate_count` + `duplicate_attempts_json`.
3. `failure_reason` enum gives structured, filterable error categories distinct from free-form messages.
4. Retry only on `failed` rows, blocked for `payload_validation`, capped at 5, fully audited.
5. `waitUntil` for speed + `recover-stalled-events` for resilience; nothing is unobservable or unrecoverable.

