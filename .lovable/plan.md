

# Plan: Date Model Strict Cleanup — Final Refinements Applied

## Summary

Remove `scheduled_at` fallbacks from all operational UI surfaces, remove `fecha_inspeccion` and `ctx_fecha_inspeccion` zombie fields, normalize labels, and separate unscheduled inspections in Admin/Executive views. 7 file changes, no migrations.

---

## Refinement Audit Results

### R1. `fecha_inspeccion` consumers
Only 3 files use it:
- `PropertyBriefingCard.tsx` — displays as "Fecha ref. inspección" (line 77)
- `inspection-generator.ts` — normalizer, snapshot, example payloads
- `types.ts` — `PropertyPayload` type

No logic depends on it. It is purely displayed in the briefing card. Safe to remove from snapshot propagation and UI. Keep in `normalizeIncomingPayload()` only so old payloads don't break parsing, but stop propagating to `normalizePropertySnapshot()`.

### R2. `ctx_fecha_inspeccion`
Only exists in `inspection-generator.ts` line 112 as a context field definition. No UI renders it, no logic uses it. It is a zombie field. **Remove it.**

### R3. `scheduled_at` remaining operational usage
Still actively used as operational fallback in:
- `AdminSchedule.tsx` lines 51, 63-65 — query order + date fallback
- `ExecutiveSchedule.tsx` lines 51, 63-65 — same
- `AdminDashboard.tsx` line 63 — "upcoming" fallback
- `ExecutiveReviewQueue.tsx` lines 202-214 — calendar grouping uses `scheduled_at` exclusively
- `PropertyBriefingCard.tsx` lines 30, 37-38 — `scheduledAt` fallback for schedule display
- `AdminInspectionDetail.tsx` — summary display + edit field (keep as legacy-only)

### R4. Unscheduled inspections
`AdminDashboard.tsx` line 63 falls back to `scheduled_at` and includes those in "upcoming". `ExecutiveReviewQueue.tsx` calendar groups by `scheduled_at`. Both need to use `fecha_recoleccion_llaves` only, with a clear "Sin coordinar" bucket for inspections without it.

### R5. UI label
"Recolección Llaves" in `PropertyBriefingCard` line 85 is the current label. Given this is the operational inspection date, **"Fecha inspección (coordinada)"** is clearer. In cards/agenda contexts, just **"Fecha inspección"**.

### R6. Inspector dashboard
Already normalized in the previous pass — uses `getScheduleDatetime()` which only reads `fecha_recoleccion_llaves`. No further changes needed there.

---

## File Changes

### 1. `src/lib/types.ts`
- Remove `fecha_inspeccion` from `PropertyPayload` (no consumers remain after cleanup)

### 2. `src/lib/inspection-generator.ts`
- **`normalizeIncomingPayload()`**: Keep `fecha_inspeccion` mapping (backward compat) but do NOT pass it forward
- **`normalizePropertySnapshot()`**: Remove `fecha_inspeccion` and `scheduled_at` from output
- **Context fields**: Remove `ctx_fecha_inspeccion` field definition (line 112)
- **Example payloads**: Remove `fecha_inspeccion` and `scheduled_at` from all 4 examples

### 3. `src/components/PropertyBriefingCard.tsx`
- Remove `scheduledAt` variable and its fallback logic (lines 30, 37-38)
- Remove `fechaInspeccion` display block (lines 32, 76-78)
- Show `fecha_recoleccion_llaves` as **"Fecha inspección"** (rename from "Recolección Llaves")
- Keep `fecha_de_termino_real_de_contrato` as **"Término contrato (ref.)"**

### 4. `src/pages/admin/AdminSchedule.tsx`
- Remove `scheduled_at` fallback in date derivation (lines 63-65). Use only `fecha_recoleccion_llaves`
- Change `.order('scheduled_at')` to `.order('updated_at')` (client-side sorts by derived date)

### 5. `src/pages/executive/ExecutiveSchedule.tsx`
- Same fix as AdminSchedule: remove `scheduled_at` fallback, change query order

### 6. `src/pages/admin/AdminDashboard.tsx`
- "Próximas" section (line 63): remove `scheduled_at` fallback. Only include inspections with `fecha_recoleccion_llaves` in the upcoming list

### 7. `src/pages/executive/ExecutiveReviewQueue.tsx`
- Calendar grouping (lines 199-219): replace `scheduled_at` with `fecha_recoleccion_llaves` from effective snapshot
- Inspections without `fecha_recoleccion_llaves` go into **"Sin coordinar"** bucket instead of being mixed into dated groups

### NOT changed
- `AdminInspectionDetail.tsx` — `scheduled_at` kept as legacy edit field, relabeled to **"Fecha programada (legacy)"** in a future pass if needed. Not blocking this cleanup.
- `inspection-service.ts` line 80 — keeps writing `scheduled_at` to DB column for backward compat. No new UI reads it.
- Inspector dashboard/calendar — already correct, no changes needed.

---

## Files Summary

| Action | File |
|---|---|
| Edit | `src/lib/types.ts` — remove `fecha_inspeccion` from PropertyPayload |
| Edit | `src/lib/inspection-generator.ts` — clean snapshot, remove ctx_fecha_inspeccion, clean examples |
| Edit | `src/components/PropertyBriefingCard.tsx` — remove scheduledAt/fechaInspeccion, relabel |
| Edit | `src/pages/admin/AdminSchedule.tsx` — remove scheduled_at fallback |
| Edit | `src/pages/executive/ExecutiveSchedule.tsx` — remove scheduled_at fallback |
| Edit | `src/pages/admin/AdminDashboard.tsx` — upcoming uses fecha_recoleccion_llaves only |
| Edit | `src/pages/executive/ExecutiveReviewQueue.tsx` — calendar uses fecha_recoleccion_llaves |

7 file changes. No migrations.

