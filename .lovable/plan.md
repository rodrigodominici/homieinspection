

# Plan: Operational Improvements — 11 Items (Final Refined)

## Migration

```sql
ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS fecha_devolucion_llave date,
  ADD COLUMN IF NOT EXISTS fecha_devolucion_llave_sync_status text NOT NULL DEFAULT 'not_applicable',
  ADD COLUMN IF NOT EXISTS property_overrides_json jsonb;
```

---

## 1. `property_overrides_json` Merge — Consistent Across All Readers

Create a utility in `src/lib/inspection-utils.ts`:

```ts
export function getEffectiveSnapshot(inspection: Inspection): Record<string, unknown> {
  const snapshot = inspection.property_snapshot_json as Record<string, unknown>;
  const overrides = (inspection as any).property_overrides_json as Record<string, unknown> | null;
  return overrides ? { ...snapshot, ...overrides } : snapshot;
}
```

Replace all direct `inspection.property_snapshot_json` reads with `getEffectiveSnapshot(inspection)` in:
- `PropertyBriefingCard.tsx`
- `InspectorCalendar.tsx`, `InspectorDashboard.tsx`, `InspectorPastInspections.tsx`
- `AdminDashboard.tsx`, `AdminSchedule.tsx`, `AdminInspectionDetail.tsx`
- `ExecutiveReviewDetail.tsx`

Update `src/lib/types.ts` to add `property_overrides_json?: Record<string, unknown> | null` to `Inspection`.

---

## 2. Pre-Inspection Property Editing with Override Warning

In `AdminInspectionDetail.tsx` Overview tab, when `status` in (`pending_assignment`, `assigned`):
- Show editable fields: `bedrooms_count`, `bathrooms_count`, `tower`, `has_parking`, `has_storage`.
- On save → write to `property_overrides_json` (not snapshot). Log in audit.
- If `bedrooms_count` or `bathrooms_count` differ from snapshot, show warning: "Los cambios en dormitorios/baños no regeneran secciones existentes automáticamente." No auto-regeneration action for this MVP.

---

## 3. `fecha_devolucion_llave` with Controlled Sync Status

Define a TypeScript union type:

```ts
type KeyReturnSyncStatus = 'not_applicable' | 'pending' | 'synced' | 'failed';
```

Use this in all code paths (not free-form strings). In `AdminInspectionDetail.tsx`:
- Date picker (real `date` input) for `fecha_devolucion_llave`.
- Status badge: `not_applicable` (gray), `pending` (amber), `synced` (green), `failed` (red).
- "Guardar fecha" sets sync_status to `'pending'`.
- "Reintentar" shown only when `'failed'`. No actual HubSpot call — UI is ready for integration.

Admin Dashboard: alert card counting finished inspections with `fecha_devolucion_llave IS NULL`.

---

## 4. Remove Typology from New Payload Usage

In `inspection-generator.ts` line 261, change:
```ts
if (payload.typology?.toLowerCase() === 'estudio')
```
to:
```ts
if (payload.bedrooms_count === 0 || payload.typology?.toLowerCase() === 'estudio')
```

This preserves backward compatibility for existing inspections with `typology: 'Estudio'` while supporting new payloads that only use `bedrooms_count`.

- Keep `typology` field in `PropertyPayload` as optional (backward compat).
- Stop rendering typology in `PropertyBriefingCard.tsx`.
- In `inspection-service.ts`, continue passing `typology` from payload (may be null for new ones).

---

## 5. Started-but-Not-Finished Visibility

In `AdminInspections.tsx`, for inspections with `status === 'assigned'` or `in_progress`:
- Show progress bar from `calculateProgress()`.
- Show `last_active_at` as relative time.
- Show `started_at` if available (this field exists on DB).
- Use `inspection_completed_at` (not generic `completed_at`) to determine finished state.
- Badge: "En progreso (45%)" vs "Sin iniciar" based on `started_at` presence.

---

## 6. Exclude "Persona que Entrega" from Budget

In `AdminInspectionDetail.tsx` and `ExecutiveReviewDetail.tsx`, filter sections with `section_type === 'handover_meta'` from budget tab section lists. No "Agregar" button for those sections.

---

## 7. Photo Upload Improvements

### 7.1 Compression
In `InspectorSectionComplete.tsx`, add client-side Canvas resize (max 1920px, JPEG 0.8) before upload. Per-photo spinner overlay.

### 7.2 Offline MVP
- Check `navigator.onLine` before upload.
- On failure: "Sin conexión — foto no subida" toast + retry button.
- Explicit: no persistent offline queue. Photos not guaranteed to survive page reload if not uploaded. Clear messaging only.

---

## 8. Mandatory Photos by Section

Add to `src/lib/section-completion.ts`:

```ts
const PHOTO_REQUIRED_KEYS = new Set(['kitchen', 'living', 'living_dormitorio', 'access']);
const PHOTO_REQUIRED_PATTERNS = [/^bedroom_/, /^bathroom_/];

export function requiresPhotoEvidence(sectionKey: string): boolean {
  return PHOTO_REQUIRED_KEYS.has(sectionKey) || PHOTO_REQUIRED_PATTERNS.some(p => p.test(sectionKey));
}
```

Update `canCompleteSection()` signature to accept `sectionKey` and `photoCount`. If `requiresPhotoEvidence(sectionKey) && photoCount === 0`, return invalid with "Se requiere al menos una foto".

Update `InspectorSectionComplete.tsx` to pass these params.

---

## 9. Calendar: Add Comuna for Chile

In `InspectorCalendar.tsx` and `AdminSchedule.tsx`, when `market === 'CL'`, display `comuna` from effective snapshot. Add `comuna` to `PropertyPayload`.

---

## 10. Catalog Dropdowns + Editable Repair Description

### 10.1 Dropdowns
In `AdminRepairCatalog.tsx`, replace `Input` for currency with `Select` (`MXN`, `CLP`, `USD`). Replace market `Input` with `Select` (`MX`, `CL`).

### 10.2 Editable Description
In Executive and Admin budget views, make `description_snapshot` an editable Textarea per repair item. On blur → update DB.

---

## 11. "No API key found in request" — Root Cause Investigation

Steps:
1. The `supabase` client in `client.ts` reads from `import.meta.env` — these are present. The SDK auto-attaches `apikey` header.
2. Search for any direct `fetch()` calls to Supabase URL that bypass SDK.
3. Check if the error occurs during `signUp()` (SDK call — should work) or during the `handle_new_user()` trigger (server-side, doesn't use apikey).
4. Most likely cause: the error surfaces from the trigger's response being misinterpreted, or a stale/cached client. Add `console.error` with full error object in `Auth.tsx` to capture exact failing path on next occurrence.
5. Add defensive check: if error message contains "API key", log `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` presence (not values) to confirm env loading.
6. Fix actual root cause once identified; improve error display as secondary measure.

---

## Files Summary

| Action | File |
|---|---|
| Migration | Add 3 columns to `inspections` |
| Edit | `src/lib/types.ts` — add new fields, `comuna`, sync status type |
| Edit | `src/lib/inspection-utils.ts` — add `getEffectiveSnapshot()` |
| Edit | `src/lib/inspection-generator.ts` — studio detection fallback |
| Edit | `src/lib/inspection-service.ts` — pass null typology for new |
| Edit | `src/lib/section-completion.ts` — `requiresPhotoEvidence()`, updated `canCompleteSection()` |
| Edit | `src/components/PropertyBriefingCard.tsx` — use `getEffectiveSnapshot`, remove typology |
| Edit | `src/pages/admin/AdminDashboard.tsx` — missing-return-key alert |
| Edit | `src/pages/admin/AdminInspectionDetail.tsx` — return key, property overrides, exclude handover budget |
| Edit | `src/pages/admin/AdminInspections.tsx` — progress/activity columns |
| Edit | `src/pages/admin/AdminRepairCatalog.tsx` — currency/market dropdowns |
| Edit | `src/pages/inspector/InspectorSectionComplete.tsx` — compression, offline retry, photo requirement |
| Edit | `src/pages/inspector/InspectorCalendar.tsx` — comuna for CL |
| Edit | `src/pages/inspector/InspectorDashboard.tsx` — use `getEffectiveSnapshot` |
| Edit | `src/pages/inspector/InspectorPastInspections.tsx` — use `getEffectiveSnapshot` |
| Edit | `src/pages/admin/AdminSchedule.tsx` — use `getEffectiveSnapshot` |
| Edit | `src/pages/executive/ExecutiveReviewDetail.tsx` — use `getEffectiveSnapshot`, exclude handover budget, repair desc edit |
| Edit | `src/pages/Auth.tsx` — root-cause debug for API key error |

~17 file changes, 1 migration.

