

# Plan — Fix `checkout_received` trigger coverage + clean up Admin Actions

## Step 1 — Diagnosis

**Why `fecha_de_recepcion_del_checkout` does not sync today**

1. `triggerCheckoutSync(...)` is wired in **only one place**: `InspectorInspectionDetail.doSubmit()` (the inspector "Enviar inspección" button) — `src/pages/inspector/InspectorInspectionDetail.tsx` line 374.
2. The Admin **Forzar Avance** path (`handleForceAdvance`, `AdminInspectionDetail.tsx` line 291) does a bare `update({ status })` and never calls any HubSpot helper. So when an admin forces `submitted`, the edge function is never invoked and no `hubspot_sync_log` row is written.
3. `advanceStage()` and `handlePublish()` likewise do not call `triggerCheckoutSync`.
4. Result: outbound sync is gated on a single UI button instead of on the business event "inspection reached checkout-received state".

**Business meaning of `checkout_received`**

Canonical event: **inspection transitions into `submitted` for the first time** (also sets `inspection_completed_at` and moves `current_stage` to `review`). That is the moment Homie has formally received the checkout. Downstream states (`in_review`, `approved`, `published`) and re-saves of an already-`submitted` inspection must NOT re-fire.

**Outdated admin fields**

- `Devolución de llave (post-inspección)` (`fecha_devolucion_llave` + `fecha_devolucion_llave_sync_status`): legacy. Only consumer is the AdminDashboard "Sin Devolución de Llave" alert card, which is itself ambiguous now that checkout reception flows through `inspection_completed_at` + outbound sync. Safe to retire from the UI.
- `Fecha de término real de contrato`: read from `property_snapshot.fecha_de_termino_real_de_contrato`, externally sourced from HubSpot. Doesn't belong in "Acciones Administrativas".

## Step 2 — Fix

### A. Centralize the checkout sync trigger

In `src/lib/hubspot-sync.ts`, add:

```ts
export async function syncCheckoutIfApplicable(opts: {
  inspectionId: string;
  previousStatus: string | null;
  newStatus: string;
  eventTimeIso: string; // canonical event timestamp
}): Promise<SyncResult | null>
```

Strict transition rule: fires `triggerCheckoutSync(inspectionId, eventTimeIso)` only when `newStatus === 'submitted'` AND `previousStatus !== 'submitted'`. Returns `null` otherwise (re-saves, downstream states, no-op transitions). Always non-blocking — caller never throws.

### B. Wire it into every status-transition path

1. **`InspectorInspectionDetail.doSubmit`** — generate one `now = new Date().toISOString()`, use it for both `inspection_completed_at` in the DB update and for `eventTimeIso` in the helper. Replace the direct `triggerCheckoutSync` call with `syncCheckoutIfApplicable({ previousStatus: inspection.status, newStatus: 'submitted', eventTimeIso: now })`.
2. **`AdminInspectionDetail.handleForceAdvance`** — generate one `now` at the top. When forcing to `submitted`, include `inspection_completed_at: now` and `current_stage: 'review'` in the same `update(...)` (only if `inspection_completed_at` is currently null, so re-forces don't overwrite history). After the update succeeds, call `syncCheckoutIfApplicable({ previousStatus: old, newStatus: forceStatusValue, eventTimeIso: now })`. Same `now` for both → consistent business event time.
3. **`advanceStage`** — defensive guard: if `extraUpdates.status === 'submitted'`, run the helper with the same timestamp used for the stage update. Today no caller does this, but the guard keeps the rule centralized.
4. **`handlePublish`** — no checkout trigger. Add a code comment documenting that checkout fires at `submitted`, not at publish.

Toast on failure mirrors the existing inspector pattern ("Sync HubSpot pendiente — revisa los logs salientes"). Status change always succeeds even if sync fails.

### C. Admin Actions cleanup (`AdminInspectionDetail.tsx` lines 836–920)

Remove from the "Acciones Administrativas" card:
- The `Devolución de llave (post-inspección)` date input + sync-status badge + "Reintentar" button (the entire `<div>` block at lines 842–891, including the `border-b pb-4` wrapper).
- The `Fecha de término real de contrato` read-only field (lines 894–897). Adjust the surviving grid from `md:grid-cols-3` to `md:grid-cols-2` (Inspector + Ejecutivo).

The card then keeps only true operational controls: Inspector, Ejecutivo, Guardar, Forzar Avance, Eliminar Inspección.

### D. Orphan reference sweep for the legacy key-return concept

After removing the field, do a project-wide pass to ensure no dangling references:

1. `src/pages/admin/AdminDashboard.tsx` — drop the `missingReturnKey` derivation (lines 70–75), the entire "Sin Devolución de Llave" card (lines 173–end of that block), the `Key` icon import if unused elsewhere, and any counter/badge tied to it.
2. Re-run searches for: `fecha_devolucion_llave`, `missingReturnKey`, `Sin Devolución de Llave`, `Devolución de llave`, `KeyReturnSyncStatus`, `set_fecha_devolucion`. Anything still referenced **only** by removed UI is also deleted (e.g. unused `KeyReturnSyncStatus` type alias from `src/lib/types.ts` if no other file imports it — verify first).
3. DB columns `fecha_devolucion_llave` and `fecha_devolucion_llave_sync_status` stay in the schema (no migration in this pass) to avoid touching the auto-generated `types.ts` or historical data. The fields in `Inspection` interface remain optional readers — they're just no longer surfaced or written from the UI.
4. Confirm no edge function or audit-log writer still references `set_fecha_devolucion`.

### E. Verification checklist

1. Inspector submit on a non-submitted inspection → one `hubspot_sync_log` row, `action='checkout_received'`.
2. Admin Forzar Avance to `submitted` on a fresh inspection → one row appears, `event_time` matches the new `inspection_completed_at`.
3. Admin Forzar Avance from `submitted` → `in_review` → no checkout row.
4. Admin Forzar Avance to `submitted` again on an already-submitted inspection → no duplicate row (transition rule blocks it).
5. Admin Actions card visually shows only: Inspector, Ejecutivo, Guardar, Forzar Avance, Eliminar.
6. Admin Dashboard no longer shows "Sin Devolución de Llave".
7. Project search returns zero hits for `missingReturnKey` and zero UI-surface hits for `fecha_devolucion_llave`.

## Files touched

- `src/lib/hubspot-sync.ts` — add `syncCheckoutIfApplicable`.
- `src/pages/admin/AdminInspectionDetail.tsx` — wire helper into `handleForceAdvance` with shared `now`; stamp `inspection_completed_at` + `current_stage='review'` when forcing into `submitted`; remove the two outdated fields; collapse the grid to 2 columns; defensive guard in `advanceStage`.
- `src/pages/inspector/InspectorInspectionDetail.tsx` — route through helper using the same `now` already generated.
- `src/pages/admin/AdminDashboard.tsx` — remove `missingReturnKey`, its card, and any newly-unused imports.
- `src/lib/types.ts` — only if `KeyReturnSyncStatus` becomes unused after the sweep.

## Summary deliverable (after implementation)

- **Root cause:** outbound sync was tied to a single UI button instead of the status transition.
- **Change:** centralized `syncCheckoutIfApplicable` helper; called from inspector submit and admin Forzar Avance whenever `status` transitions into `submitted` for the first time, with one canonical timestamp shared across DB stamp and HubSpot payload.
- **Business event:** first-time transition `status → submitted` is the single trigger for `fecha_de_recepcion_del_checkout`. Re-saves and downstream states never re-fire.
- **`Devolución de llave (post-inspección)`** removed from Admin detail and Admin Dashboard; orphan sweep confirms no remaining references.
- **`Fecha de término real de contrato`** removed from Acciones Administrativas (remains visible via the property briefing area which sources the snapshot directly).

