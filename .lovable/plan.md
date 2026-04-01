

# Plan: Inspector Date Model Normalization & UX Correction Pass

## Summary

Normalize all Inspector logic around the correct 3-date business model, introduce "Por coordinar" as a first-class concept, fix hero/KPI/card state issues, and improve spacing. 8 file changes, no migrations.

---

## Refinements Applied

### R1. `to_coordinate` only for non-started, non-completed inspections
`isToCoordinate()` checks: has `fecha_de_termino_real_de_contrato`, lacks `fecha_recoleccion_llaves`, AND status is in `['assigned', 'pending_assignment', 'pending']` with no `started_at`. This prevents conflict with `in_progress`, `ready_to_submit`, or any post-submission state.

### R2. Keep `fechaInspeccion` in PropertyBriefingCard
`fecha_inspeccion` is still present in payloads and may carry useful context (e.g., originally planned date from HubSpot). Keep it in the briefing card but relabel as **"Fecha referencia inspección"** to distinguish it from the operational key collection date. Do not remove.

### R3. `unscheduled` example payload gets `fecha_de_termino_real_de_contrato`
Add `fecha_de_termino_real_de_contrato: "2026-04-15"` to the `unscheduled` payload (no `fecha_recoleccion_llaves`). This exercises the "Por coordinar" flow.

### R4. "Completadas hoy" uses real completion signal
Already implemented in `isCompletedToday()` — checks `inspection_completed_at ?? completed_at` against today, only for statuses in `{submitted, in_review, approved, published, sent}`. No change needed; just confirming this is already correct.

### R5. Calendar must use `fecha_recoleccion_llaves` only
`InspectorCalendar` already calls `getScheduleDatetime()`. The fix is in that helper: remove the `scheduled_at` fallback so the calendar is strictly driven by key collection date. Additionally, the Supabase query in calendar currently orders by `scheduled_at` — change that to `updated_at` since ordering is done client-side via `scheduleDatetime`.

### R6. Contextual wording for `fecha_de_termino_real_de_contrato`
Display as **"Término de contrato (ref.)"** in briefing card and **"Contrato termina:"** in the "Por coordinar" dashboard cards, making it clear this is coordination guidance, not the inspection date.

---

## File Changes

### 1. `src/lib/types.ts`
Add to `PropertyPayload`:
- `fecha_de_termino_real_de_contrato?: string`
- `fecha_de_recepcion_del_checkout_cl?: string`

### 2. `src/lib/inspection-generator.ts`
- `normalizeIncomingPayload()`: map legacy names for both new fields
- `normalizePropertySnapshot()`: add both new fields
- `unscheduled` example payload: add `fecha_de_termino_real_de_contrato: "2026-04-15"`, no `fecha_recoleccion_llaves`

### 3. `src/lib/inspector-operational.ts` — Rewrite
- **`getScheduleDatetime()`**: Remove `scheduled_at` fallback (lines 34-37). Only use `fecha_recoleccion_llaves` from effective snapshot.
- **Add `getContractEndDate()`**: Read `fecha_de_termino_real_de_contrato` from effective snapshot.
- **Add `isToCoordinate()`**: Returns true when inspection has contract-end date, no key collection date, status is pre-work (`assigned|pending_assignment|pending`), and no `started_at`.
- **`getInspectorDisplayState()`**: Add `to_coordinate` key (with label "Por coordinar", tone `warning`) between the `in_progress` and `assigned` checks. Only applies when `isToCoordinate()` passes — requires the full inspection object, so signature changes to accept `Inspection` + snapshot access.
- **`matchesInspectorStateFilter()`**: Add `to_coordinate` and `ready_to_send` filter cases.
- **`InspectorDisplayState.key`**: Add `'to_coordinate'` to the union.

### 4. `src/pages/inspector/InspectorDashboard.tsx`
- **KPI cards**: Replace "Pendientes" with "Por coordinar" → `/inspector/all?filter=active&state=to_coordinate`.
- **"Por coordinar" section**: New block between "Requiere atención" and "Agenda de hoy". Each card shows property name, address, "Contrato termina: {date}" label, WhatsApp CTA (if tenant data available), and link to detail.
- **Hero priority**: Add step 4 — nearest "por coordinar" inspection (by contract end date) before empty state.
- **`todayInspections`**: Already correct (uses `scheduleDatetime` which will now be strictly `fecha_recoleccion_llaves`).
- **Spacing**: `space-y-6` → `space-y-7` between major sections.

### 5. `src/pages/inspector/InspectorAllInspections.tsx`
- Add `state=to_coordinate` and `state=ready_to_send` filter support in URL param parsing and `matchesInspectorStateFilter`.
- Increase card spacing `space-y-3` → `space-y-4`.

### 6. `src/pages/inspector/InspectorCalendar.tsx`
- Change Supabase query `.order('scheduled_at', ...)` to `.order('updated_at', ...)` since client-side sorting uses `scheduleDatetime`.
- The `getScheduleDatetime()` fix propagates automatically.
- Increase card spacing.

### 7. `src/pages/inspector/InspectorInspectionDetail.tsx`
- In key collection block (pending state), add "Contrato termina: {date}" reference line when `fecha_de_termino_real_de_contrato` is available.
- Spacing: increase `space-y-5` → `space-y-6` between cards.

### 8. `src/components/PropertyBriefingCard.tsx`
- Keep `fechaInspeccion` but relabel: **"Fecha ref. inspección"**.
- Add `fecha_de_termino_real_de_contrato` display as **"Término contrato (ref.)"** info block.
- No removal of existing fields.

---

## Files Summary

| Action | File |
|---|---|
| Edit | `src/lib/types.ts` — add 2 date fields to PropertyPayload |
| Edit | `src/lib/inspection-generator.ts` — normalize + unscheduled payload |
| Rewrite | `src/lib/inspector-operational.ts` — remove scheduled_at fallback, add to_coordinate |
| Edit | `src/pages/inspector/InspectorDashboard.tsx` — Por coordinar section, hero, KPI |
| Edit | `src/pages/inspector/InspectorAllInspections.tsx` — new filter support, spacing |
| Edit | `src/pages/inspector/InspectorCalendar.tsx` — query order fix, spacing |
| Edit | `src/pages/inspector/InspectorInspectionDetail.tsx` — contract-end reference, spacing |
| Edit | `src/components/PropertyBriefingCard.tsx` — relabel + add contract-end |

8 file changes. No migrations.

