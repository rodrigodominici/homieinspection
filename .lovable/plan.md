

# Plan — Decoupled external references + outbound HubSpot sync (revised)

`inspections` stays HubSpot-agnostic. External references live in a dedicated table. Outbound sync resolves the target object through that table.

---

## 1. New table: `inspection_external_references`

### 1a. Uniqueness — business rule revisited

A HubSpot `lease_contract` represents one tenancy. In practice the **same contract can be inspected more than once over its life** (typical case: one `check_in` at the start, one `check_out` at the end; possibly mid-lease incidents). So a contract → inspection link is **1-to-many over time**, not strictly 1-to-1.

Therefore we must NOT enforce global uniqueness on `(provider, external_object_type, external_object_id)` — that would block legitimate second inspections of the same contract.

What we DO want to prevent:
- The same active reference attached to **two different inspections at the same time** (would make outbound routing ambiguous).
- The same external object linked **twice to the same inspection** (duplicate noise).

### 1b. Schema

```sql
create table public.inspection_external_references (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  provider text not null,                 -- 'hubspot'
  external_object_type text not null,     -- 'lease_contract'
  external_object_id text not null,       -- 'hs_contrato_37382862379' or '37382862379'
  external_object_type_id text,           -- '2-47492934'
  is_active boolean not null default true,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One active reference per (inspection, provider, object_type, object_id).
-- Allows the same contract to be re-linked later via a new row, or to a
-- different inspection later, but never two active rows for the same pair.
create unique index inspection_external_refs_active_per_inspection_idx
  on public.inspection_external_references
    (inspection_id, provider, external_object_type, external_object_id)
  where is_active = true;

-- Prevent the same external object being actively linked to two different
-- inspections at the same time (ambiguous outbound routing).
create unique index inspection_external_refs_active_object_idx
  on public.inspection_external_references
    (provider, external_object_type, external_object_id)
  where is_active = true;

create index inspection_external_refs_inspection_idx
  on public.inspection_external_references (inspection_id);

create index inspection_external_refs_lookup_idx
  on public.inspection_external_references
    (inspection_id, provider, external_object_type)
  where is_active = true;
```

Both unique indexes are partial (`where is_active = true`) — historical rows can coexist freely once deactivated. When a contract is reused for a new inspection, the previous row is flipped to `is_active=false` first.

RLS: enabled. `Admins can manage external references` (`has_role(auth.uid(),'admin')`). `update_updated_at_column` trigger.

**No column added to `inspections`.** Raw `external_object_id` continues to live only on `inspection_source_events` (event ledger, not domain model).

---

## 2. Intake change — explicit lookup-then-insert/update

Per refinement #1, partial unique indexes don't reliably back PostgREST `upsert(onConflict: ...)`. We use an **explicit, transactional-style lookup-then-write** instead.

After `create_inspection_from_event` returns success (inside the existing `EdgeRuntime.waitUntil` block):

```ts
const externalObjectId = body.external_object_id ?? null;
if (row?.inspection_id && !row?.failure_reason && externalObjectId) {
  const provider = 'hubspot';
  const externalObjectType = 'lease_contract';
  const externalObjectTypeId = '2-47492934';
  const objectIdStr = String(externalObjectId);

  // Step A: is there already an ACTIVE reference for this exact pair on THIS inspection?
  const { data: existingForThis } = await supabase
    .from('inspection_external_references')
    .select('id')
    .eq('inspection_id', row.inspection_id)
    .eq('provider', provider)
    .eq('external_object_type', externalObjectType)
    .eq('external_object_id', objectIdStr)
    .eq('is_active', true)
    .maybeSingle();

  if (existingForThis) {
    // refresh metadata only
    await supabase
      .from('inspection_external_references')
      .update({
        metadata: {
          external_event_id: externalEventId,
          source_event_id: eventId,
          received_at: new Date().toISOString(),
        },
      })
      .eq('id', existingForThis.id);
  } else {
    // Step B: is this object actively linked to a DIFFERENT inspection? Deactivate it.
    await supabase
      .from('inspection_external_references')
      .update({ is_active: false })
      .eq('provider', provider)
      .eq('external_object_type', externalObjectType)
      .eq('external_object_id', objectIdStr)
      .eq('is_active', true);

    // Step C: insert the new active reference
    const { error: insertErr } = await supabase
      .from('inspection_external_references')
      .insert({
        inspection_id: row.inspection_id,
        provider,
        external_object_type: externalObjectType,
        external_object_type_id: externalObjectTypeId,
        external_object_id: objectIdStr,
        is_active: true,
        metadata: {
          external_event_id: externalEventId,
          source_event_id: eventId,
          received_at: new Date().toISOString(),
        },
      });

    if (insertErr) {
      console.error('[intake] external_reference insert failed', insertErr);
      // Non-fatal — inspection is already created.
    }
  }
}
```

Failures are logged but never fail the intake. The RPC and manual creation flow are untouched.

---

## 3. New table: `hubspot_sync_log`

```sql
create table public.hubspot_sync_log (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid references public.inspections(id) on delete set null,
  external_reference_id uuid references public.inspection_external_references(id) on delete set null,
  action text not null,                    -- 'key_collection_date' | 'checkout_received'
  hubspot_object_type_id text,             -- '2-47492934'
  hubspot_object_id text,                  -- numeric contract id used in URL
  request_payload jsonb,
  response_status int,
  response_body jsonb,
  status text not null,                    -- 'success' | 'error' | 'skipped'
  error_message text,
  triggered_by uuid,
  event_time timestamptz,                  -- the explicit event time sent to HubSpot
  created_at timestamptz not null default now()
);

create index hubspot_sync_log_inspection_idx on public.hubspot_sync_log (inspection_id, created_at desc);
create index hubspot_sync_log_status_idx on public.hubspot_sync_log (status, created_at desc);
```

RLS: `Admins can manage sync log`. Edge function writes via service role.

---

## 4. New edge function: `hubspot-update-inspection`

`supabase/functions/hubspot-update-inspection/index.ts` — `verify_jwt = true`.

Input:
```json
{
  "inspection_id": "uuid",
  "action": "key_collection_date" | "checkout_received",
  "event_time": "ISO-8601 (optional, server falls back per action)"
}
```

Flow:
1. Validate caller JWT → resolve `triggered_by`.
2. Fetch the inspection (need `fecha_recoleccion_llaves`, `inspection_completed_at`, `status`).
3. **Resolve event time (refinement #3):**
   - `key_collection_date` → use `inspection.fecha_recoleccion_llaves` (the value the inspector just saved). Reject with `status='error'`/`error_message='missing_key_date'` if null.
   - `checkout_received` → use, in priority order:
     1. `event_time` from the request body (the caller — the submit handler — passes the actual submit timestamp),
     2. `inspection.inspection_completed_at` if set,
     3. `now()` as last resort.
   We **do not** use `updated_at`. The chosen value is persisted in `hubspot_sync_log.event_time` for traceability.
4. **Resolve external reference:**
   ```ts
   const { data: ref } = await supabase
     .from('inspection_external_references')
     .select('id, external_object_id, external_object_type_id')
     .eq('inspection_id', inspection_id)
     .eq('provider', 'hubspot')
     .eq('external_object_type', 'lease_contract')
     .eq('is_active', true)
     .maybeSingle();
   ```
   Missing → log `status='skipped'`, `error_message='no_active_external_reference'`. No PATCH. Return 200 `{ skipped: true }`.
5. Derive numeric HubSpot id (strip `hs_contrato_` prefix → digits). Non-numeric → log `status='error'`, `error_message='invalid_external_object_id'`.
6. Build PATCH body:
   - `key_collection_date` → `{ properties: { fecha_recoleccion_llaves: <event_time as ISO date> } }`
   - `checkout_received` → `{ properties: { fecha_recepcion_checkout: <event_time as ISO date> } }`
7. PATCH via connector gateway:
   ```
   PATCH https://connector-gateway.lovable.dev/hubspot/crm/v3/objects/{external_object_type_id}/{numericId}
   ```
   Headers: `Authorization: Bearer ${LOVABLE_API_KEY}`, `X-Connection-Api-Key: ${HUBSPOT_API_KEY}`, `Content-Type: application/json`.
8. Persist a row in `hubspot_sync_log` with full request/response, `external_reference_id=ref.id`, `event_time`, `status='success'|'error'`.
9. Return `{ ok, log_id, status }`.

Add `[functions.hubspot-update-inspection] verify_jwt = true` to `supabase/config.toml`.

---

## 5. Client triggers

**Feature 1 — Inspector saves `fecha_recoleccion_llaves`:**
After the existing successful date update:
```ts
supabase.functions.invoke('hubspot-update-inspection', {
  body: { inspection_id, action: 'key_collection_date' },
});
```
The function reads the just-saved date from the inspection.

**Feature 2 — Inspection transitions to `submitted`:**
Capture the submit timestamp at the call site and pass it explicitly:
```ts
const submittedAt = new Date().toISOString();
// ... update inspection status to 'submitted' (and set inspection_completed_at = submittedAt) ...
supabase.functions.invoke('hubspot-update-inspection', {
  body: { inspection_id, action: 'checkout_received', event_time: submittedAt },
});
```
Both calls are best-effort; failures only show as rows in `hubspot_sync_log`.

---

## 6. Admin config — "Sincronización HubSpot saliente"

In `AdminIntegrationHubSpot.tsx`, add a card after intake config:
- Title: **Sincronización HubSpot saliente**
- Two read-only rows:
  - `fecha_recoleccion_llaves` ← inspector guarda fecha de recolección
  - `fecha_recepcion_checkout` ← inspección pasa a `submitted`
- HubSpot object type id `2-47492934` shown as monospace.
- Header button "Ver logs salientes" → `AdminIntegrationHubSpotOutboundLogs`.

### Outbound logs page (refinement #4)

`AdminIntegrationHubSpotOutboundLogs.tsx` mirrors `AdminIntegrationHubSpotLogs.tsx` exactly:
- Same `AdminLayout` + breadcrumb pattern (`Integraciones / HubSpot / Logs salientes`).
- Same header layout, search input style, status filter chip group, table primitives, row density, timestamp formatting, expandable detail row for request/response JSON.
- Columns: `created_at` · `action` · `inspection_id` (link) · `hubspot_object_id` · `event_time` · `status` (badge: success/error/skipped colored like the inbound `completed`/`failed`/`received`) · `error_message` · expand for full request/response.
- Search by `inspection_id`, `hubspot_object_id`, `error_message`.
- Filter chips: `Todas` / `Éxito` / `Error` / `Omitido`.

Visual parity is the explicit goal — no new component patterns.

---

## 7. Files

**Migrations**
- `<ts>_inspection_external_references.sql`
- `<ts>_hubspot_sync_log.sql`

**Edge functions**
- `supabase/functions/hubspot-update-inspection/index.ts` (new)
- `supabase/functions/hubspot-inspection-intake/index.ts` (lookup-then-insert/update for the reference)
- `supabase/config.toml` (verify_jwt block for the new function)

**Client**
- `src/pages/admin/AdminIntegrationHubSpot.tsx` (outbound config card + button)
- `src/pages/admin/AdminIntegrationHubSpotOutboundLogs.tsx` (new, mirrors inbound logs)
- `src/App.tsx` (route)
- Inspector key-date save handler → fire `key_collection_date`
- Inspector submit handler → fire `checkout_received` with explicit `event_time`

**Untouched:** `inspections` schema, `create_inspection_from_event` RPC, manual creation, intake flow up to RPC success.

---

## Final summary (after implementation)

- **External reference model:** dedicated `inspection_external_references` table with two partial unique indexes — one per `(inspection, provider, object_type, object_id)` to avoid duplicates on the same inspection, one per active `(provider, object_type, object_id)` to avoid ambiguous routing. Historical rows coexist freely as `is_active=false`, which permits a contract to be inspected multiple times over its lifecycle.
- **Why `inspections` stays decoupled:** the domain model has no HubSpot column. New providers/object types are row inserts, not schema changes.
- **Intake persistence:** explicit lookup-then-insert/update in the intake background task — first checks for an existing active reference on the same inspection, otherwise deactivates any active reference for the same external object on a different inspection, then inserts the new active row. No `upsert` against partial indexes.
- **Outbound resolution:** `hubspot-update-inspection` takes `inspection_id` + `action` (+ optional `event_time`), looks up the active HubSpot lease_contract reference, derives the numeric id, PATCHes via the connector gateway, and writes one row to `hubspot_sync_log` capturing the explicit event time. Missing/invalid reference → logged `skipped`/`error`, no PATCH. `checkout_received` uses the submit-time event timestamp (never `updated_at`). Outbound logs page mirrors the existing inbound logs visual pattern.

