
Goal: apply a focused Inspector correction pass (no unrelated rework), with your 6 refinements incorporated before implementation.

## Updated implementation plan

### 1) KPI cards: actionable + explicit URL filter semantics
- Keep KPI cards clickable and route via query params.
- Replace ambiguous `state=pending_work` with explicit operational values:
  - `Hoy` → `/inspector/agenda?date=today`
  - `En progreso` → `/inspector/all?filter=active&state=in_progress`
  - `Completadas hoy` → `/inspector/all?filter=past&scope=completed_today`
  - `Pendientes` → `/inspector/all?filter=active&state=assigned_or_needs_changes`
- In `InspectorAllInspections`, parse and apply:
  - `filter=active|past`
  - `state=in_progress|assigned_or_needs_changes`
  - `scope=completed_today`

### 2) Hero/banner: real next-action priority
- Rework dashboard hero selection to:
  1. in-progress inspection
  2. ready-to-send inspection (100% sections, not submitted)
  3. scheduled today/upcoming
  4. assigned/needs_changes backlog
  5. empty state only if none exist
- This prevents “Sin inspecciones pendientes” when operational work still exists.

### 3) Key collection date/time ownership (source of truth + projection)
- Define **primary operational source**: `inspection_field_values` (closing section keys `fecha_recoleccion_llaves`, `hora_recoleccion_llaves`).
- Define **read-optimized mirror/projection**: `inspections.property_overrides_json` (same keys) for fast contextual reads in dashboard/agenda/briefing.
- Enforce one-way ownership:
  - Inspector edits write to field values first.
  - On successful save, mirror to overrides.
  - Reads for operational edit UI use primary values; summary cards can use mirrored snapshot.

### 4) Key collection block redesign in inspection detail
- Add clear operational card in `InspectorInspectionDetail` with two states:
  - **Pendiente**: “Recolección de llaves”, status pending, CTA WhatsApp + CTA “Cargar fecha”.
  - **Coordinada**: show saved date/time, CTA “Editar”.
- Keep this block prominent in summary area (not hidden as passive metadata).

### 5) “Completadas hoy” correctness
- Base `completed_today` on real completion/submission signal, not generic updates:
  - eligible statuses: `submitted | in_review | approved | published | sent`
  - date source: `inspection_completed_at` (fallback `completed_at`)
  - must match current day (`es-CL` day boundary handling in UI logic).

### 6) Agenda `date=today`: visibly selected + focused
- In `InspectorCalendar`, read `date` query param.
- If `date=today`, initialize `selectedDate` to today and auto-scroll the day pill row so today is centered/visible.
- Keep the selected pill highlighted immediately on first render.

### 7) Status/progress consistency without breaking shared badges
- Do **not** alter shared global `InspectionStatusBadge` semantics for Admin/Executive.
- Implement inspector-only derived display state in Inspector pages (local helper/component), e.g.:
  - 0% + assigned/pending_assignment → “Asignada”
  - 1–99% → “En progreso”
  - 100% + not submitted → “Lista para enviar”
  - submitted+ → existing downstream label
- Use derived label in Inspector cards/hero only.

### 8) Spacing cleanup: cards + grouped blocks
- Improve vertical rhythm at two levels:
  - card-to-card spacing (lists)
  - section-to-section spacing (hero, KPIs, requires-attention, agenda groups)
- Normalize block paddings/margins so grouped areas feel clearly separated and not compressed.

## Files to update (focused)
- `src/pages/inspector/InspectorDashboard.tsx`
- `src/pages/inspector/InspectorAllInspections.tsx`
- `src/pages/inspector/InspectorCalendar.tsx`
- `src/pages/inspector/InspectorInspectionDetail.tsx`
- `src/components/PropertyBriefingCard.tsx` (only if needed for key-collection display consistency)

## Guardrails
- No Admin/Executive behavior changes.
- No global status badge regressions.
- No unrelated inspection template/model refactors in this pass.
