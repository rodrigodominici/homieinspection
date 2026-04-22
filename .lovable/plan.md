

# Plan — Complete, observable outbound HubSpot sync (Path A: direct API)

End-to-end fix that resolves both the outbound credential decision and the silent-trigger problem.

## 1. Architecture (unchanged, reaffirmed)

- `inspections` stays HubSpot-agnostic.
- `inspection_external_references` remains the canonical resolver of the HubSpot target (`provider='hubspot'`, `external_object_type='lease_contract'`, `is_active=true`, with `external_object_type_id` falling back to `2-47492934`).
- `hubspot_sync_log` remains the single trace of every outbound attempt.

## 2. Outbound transport — direct HubSpot API

**New secret (request via add_secret, wait for value before deploy):**
- `HUBSPOT_PRIVATE_APP_TOKEN` — HubSpot Private App token with `crm.objects.custom.read` + `crm.objects.custom.write` (and any object-specific scope for `2-47492934`).

**Untouched:**
- `HUBSPOT_INTAKE_SECRET` (inbound webhook only).
- `LOVABLE_API_KEY` / `HUBSPOT_API_KEY` are no longer read by this function.

**Request shape inside `supabase/functions/hubspot-update-inspection/index.ts`:**
```
PATCH https://api.hubapi.com/crm/v3/objects/{external_object_type_id}/{numericId}
Authorization: Bearer ${HUBSPOT_PRIVATE_APP_TOKEN}
Content-Type: application/json
{ "properties": { [propertyName]: "YYYY-MM-DD" } }
```
where `numericId = external_object_id.replace(/^hs_contrato_/,'')` then validated as digits. Invalid → log `error` (`invalid_external_object_id`), no PATCH.

## 3. Make the trigger never silent again (the real fix)

Three coordinated changes:

### 3a. Switch `hubspot-update-inspection` to `verify_jwt = false`

In `supabase/config.toml`, flip this single function to `verify_jwt = false`. JWT is still validated **inside** the function via `supabase.auth.getUser(token)` exactly as today — but now an invalid/missing JWT no longer dies at the platform gateway with no trace. Instead the in-code logger writes a `status='error'` row (`error_message='unauthorized'`) to `hubspot_sync_log` before returning 401. Same for invalid JSON body (`error_message='invalid_body'`). Result: **every invocation that reaches the function leaves a row.** The inbound function is unaffected.

### 3b. Frontend triggers become awaited + visible (still non-blocking for the main save)

`src/lib/hubspot-sync.ts` already returns `{ ok, error? }`. The two call sites change from fire-and-forget to:

```ts
const res = await triggerKeyCollectionSync(inspection.id);
if (!res.ok) {
  toast({
    title: 'Sync HubSpot pendiente',
    description: 'La fecha se guardó pero no se pudo enviar a HubSpot. Revisa los logs salientes.',
    variant: 'destructive',
  });
}
```

The main save/submit succeeds independently — only the HubSpot side surfaces a toast on failure. Applied to:
- `InspectorInspectionDetail.tsx` → after `handleSaveKeyCollection` (key date) and after `doSubmit` succeeds (checkout).
- `AdminInspectionDetail.tsx` → admin inline date editor + manual "Reenviar a HubSpot" button (already awaits — no change needed beyond the toast wording reuse).

### 3c. Function-side: `hubspot_sync_log` insert is the **first** thing on every exit path

Refactor `index.ts` so every return path goes through a single `logAndRespond(status, http, fields)` helper. No early `return jsonResponse(...)` without logging. Covers: unauthorized, invalid body, missing inspection, missing date, no active reference (→ `skipped`), invalid object id, missing token, HubSpot HTTP error, network throw, success.

## 4. Feature wiring (already in code, kept)

- **Save `fecha_recoleccion_llaves`** (inspector + admin) → `triggerKeyCollectionSync(inspection_id)` → function PATCHes `fecha_recoleccion_llaves` (YYYY-MM-DD) on the resolved contract. Null date → log `skipped` (`error_message='missing_key_date'`), no PATCH.
- **Inspector submits inspection** (`status → submitted`) → `triggerCheckoutSync(inspection_id, submitTimestampIso)` → function PATCHes `fecha_recepcion_checkout` using the explicit submit-time event_time, never `updated_at`.

## 5. Admin visibility (already shipped, lightly extended)

- `AdminIntegrationHubSpot.tsx` "Sincronización HubSpot saliente" card already lists the two events and the destination object — keep as-is, add a one-line credential indicator: "Token: `HUBSPOT_PRIVATE_APP_TOKEN` (configurado / faltante)" derived from a tiny health-check call to the function (or a simple "presence" shown once the secret is added — display the static label, no extra call).
- `AdminIntegrationHubSpotOutboundLogs.tsx` already renders `hubspot_sync_log` with success/error/skipped chips, request/response panels, and links to the inspection — kept.

## 6. Files touched

- edit `supabase/functions/hubspot-update-inspection/index.ts` — drop gateway, use `HUBSPOT_PRIVATE_APP_TOKEN`, direct `https://api.hubapi.com` PATCH, single `logAndRespond` helper covering every exit.
- edit `supabase/config.toml` — set `[functions.hubspot-update-inspection] verify_jwt = false` (in-code JWT check stays).
- edit `src/lib/hubspot-sync.ts` — no API change; ensure result is fully typed.
- edit `src/pages/inspector/InspectorInspectionDetail.tsx` — `await` both triggers, surface toast on `!ok`.
- edit `src/pages/admin/AdminIntegrationHubSpot.tsx` — small "Token configurado" status line in the outbound card.

No DB migration. Inbound function and `HUBSPOT_INTAKE_SECRET` untouched.

## 7. Verification after deploy

1. Save a key collection date as the inspector → expect a `success` row in `hubspot_sync_log` and a green chip in `/admin/integrations/hubspot/outbound-logs`. Verify HubSpot contract `fecha_recoleccion_llaves` updated.
2. Submit an inspection → expect a `success` row with `action=checkout_received` and `event_time = submit time`. Verify HubSpot `fecha_recepcion_checkout` updated.
3. Use admin "Reenviar a HubSpot" on `RE0001874` (`b0694de7…`) to backfill the already-saved `2026-04-25` and produce the first row.
4. Negative paths sanity: temporarily call without auth → row with `status='error'`, `error_message='unauthorized'` appears (proves silence is gone).

## Summary

- **External reference resolution:** outbound function takes `inspection_id`, queries `inspection_external_references` for the active HubSpot `lease_contract`, uses `external_object_id` (stripped of `hs_contrato_` prefix → numeric) and `external_object_type_id` (fallback `2-47492934`). `inspections` stays decoupled from HubSpot identity.
- **Direct HubSpot PATCH:** `PATCH https://api.hubapi.com/crm/v3/objects/{typeId}/{numericId}` with `Authorization: Bearer ${HUBSPOT_PRIVATE_APP_TOKEN}`. Connector gateway path removed for outbound.
- **Silent-trigger fix:** function flips to `verify_jwt = false` (in-code JWT validation kept), every exit path goes through one `logAndRespond` that always inserts into `hubspot_sync_log`, and frontend triggers are awaited so failures surface as a non-blocking toast.
- **On save of `fecha_recoleccion_llaves`:** UI persists field + overrides, awaits `triggerKeyCollectionSync`, function resolves the contract, PATCHes `fecha_recoleccion_llaves`, logs `success`/`error`/`skipped`. Failure → toast pointing to outbound logs.
- **On submit:** UI sets `status='submitted'`, awaits `triggerCheckoutSync(id, submitIso)`, function PATCHes `fecha_recepcion_checkout` with the explicit submit timestamp, logs the outcome. Submit UX is not blocked.
- **Admin visibility:** existing outbound card lists the two events + destination object; outbound logs page renders every `hubspot_sync_log` row with success/error/skipped chips and request/response detail.

