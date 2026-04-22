

# Plan — Fix outbound HubSpot sync trigger coverage

## Diagnosis

You set the key collection date on inspection `b0694de7…` (property `RE0001874`) from the **Admin** detail page. The outbound sync did not fire — and there is nothing in `hubspot_sync_log` — because the call to `hubspot-update-inspection` is wired **only** inside the inspector screen (`InspectorInspectionDetail.tsx`).

Confirmed in DB:
- `inspections.property_overrides_json.fecha_recoleccion_llaves = 2026-04-24` ✓
- `inspection_external_references` has an active HubSpot `lease_contract` row (`hs_contrato_45601838750`) ✓
- `hubspot_sync_log` is empty ✗ (function was never invoked)
- Inspection status is `pending_assignment` → no inspector assigned, so the inspector flow that owns the trigger isn't reachable for this record anyway.

So the architecture is correct end-to-end; the problem is **trigger coverage**: the sync only fires from one of the surfaces that can change the date, and that surface isn't usable for unassigned inspections.

## Fix — Make the trigger source-agnostic via a single client helper, and cover all edit surfaces

### 1. New helper: `src/lib/hubspot-sync.ts`

A tiny wrapper around `supabase.functions.invoke('hubspot-update-inspection', …)`:

- `triggerKeyCollectionSync(inspectionId)`
- `triggerCheckoutSync(inspectionId, eventTimeIso)`

Best-effort, non-blocking (fire-and-forget, swallow errors, console.warn on failure). All callers go through this — no more inline `functions.invoke` duplication.

### 2. Wire the helper into every place the key date can be set

- **`InspectorInspectionDetail.tsx`** — replace the existing inline invoke with the helper (no behavior change).
- **`AdminInspectionDetail.tsx`** — add an inline editor for `fecha_recoleccion_llaves` / `hora_recoleccion_llaves` (date + time popover, same pattern as inspector). On save:
  1. Update `inspections.property_overrides_json` (merge).
  2. Call `triggerKeyCollectionSync(inspection.id)`.
  3. Refresh local state + toast.
  This unblocks the current inspection (`pending_assignment`) and matches the memory rule that admins have full operational control over inspector-entered data.
- **Same for checkout submission** — replace inline invoke in inspector submit flow with `triggerCheckoutSync`.

### 3. Backfill the inspection that already has a date but never synced

One-shot manual trigger after the UI ships: call `hubspot-update-inspection` for `b0694de7-7045-4594-9ad0-e946a2e45b75` with `action=key_collection_date` so HubSpot receives the `2026-04-24` you already entered, and a row appears in `hubspot_sync_log`. Done from the new admin date editor's "Reenviar a HubSpot" button described next.

### 4. Manual "Resend" button (admin-only) on AdminInspectionDetail

Small `Reenviar a HubSpot` button next to the key-date row (visible to admins only). Calls `triggerKeyCollectionSync` for the current inspection. Useful for:
- Backfilling historical inspections whose date was set before sync existed.
- Re-pushing after a HubSpot-side error visible in the Outbound logs.

No checkout resend button — checkout is event-driven on submit and shouldn't be re-fired manually.

### 5. Outbound logs surface (sanity)

No code change — but confirm the `Eventos salientes` page at `/admin/integrations/hubspot/outbound-logs` will start showing rows once any of the above triggers run. (It already queries `hubspot_sync_log` directly and only needs rows to render.)

## Out of scope

- No new DB migration. `inspection_external_references` and `hubspot_sync_log` are already in place.
- No edge function changes — `hubspot-update-inspection` is correct; it just wasn't being called.
- No connector changes — once the HubSpot connector is linked, the existing function will PATCH; until then logs will record `connector_secrets_missing` (which is itself a useful signal in the outbound logs page).

## Files touched

- create `src/lib/hubspot-sync.ts`
- edit `src/pages/inspector/InspectorInspectionDetail.tsx` (use helper)
- edit `src/pages/admin/AdminInspectionDetail.tsx` (add inline date/time editor + Resend button + helper call)

## Summary

- **Root cause:** outbound sync only fired from the inspector screen; admin edits and unassigned inspections bypassed it, so `hubspot_sync_log` stayed empty.
- **Fix:** centralize the trigger in one helper, call it from every surface that mutates `fecha_recoleccion_llaves`, and add an admin-side editor + manual resend so admins can both set the date and re-push existing dates.
- **Backfill:** use the new admin Resend button on `b0694de7…` to push the already-saved `2026-04-24` to HubSpot and produce the first outbound log row.

