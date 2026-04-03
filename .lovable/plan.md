

# Plan: Dual-Date Calendar + Filter + Visual Distinction for Admin, Executive & Inspector

## Summary

Add `contractEndDate` to calendar data models. Introduce a 3-way filter toggle (Todas / Programadas / Por coordinar). Show uncoordinated items in a dedicated **top-of-day banner row** (not in an hour slot) with explicit "Por coordinar" + "Término de contrato: date" text. Split the bottom unscheduled section into "Por coordinar" and "Sin programar". 5 file changes, no migrations.

---

## Key Design Decisions

### R1. Uncoordinated items NOT placed in hour slots
Instead of placing uncoordinated inspections at 8:00 (confusable with real appointments), they render in a **day-header sub-row** below the day label. This row spans the full day column, uses a distinct amber/warning background and dashed border, and contains explicit text: "Por coordinar · Término: 20 mar". Visually impossible to confuse with a time-slotted appointment.

### R2. Date precedence
- `fecha_recoleccion_llaves` → programmed, placed in hour grid
- Only if missing: `fecha_de_termino_real_de_contrato` → coordination reference, placed in day-header banner
- Neither → "Sin programar" (bottom section)

### R3. Card semantics for Por coordinar
Cards show: contract-end date, property name, inspector. No progress emphasis. Distinct amber tone + dashed border + "Por coordinar" text label.

### R4. Explicit distinction
- **Por coordinar** = has `fecha_de_termino_real_de_contrato` but no `fecha_recoleccion_llaves`
- **Sin programar** = has neither date

### R5. Not color/border only
Grid items and bottom cards both include explicit "Por coordinar" text label + "Término de contrato: date" — not relying solely on visual styling.

---

## File Changes

### 1. `src/pages/admin/AdminSchedule.tsx`

**Extend data model** (line 14-17):
- Add `contractEndDate: Date | null` to `ScheduledInspection`
- In useEffect data load, compute `contractEndDate` from `snapshot?.fecha_de_termino_real_de_contrato`

**Add filter state + toggle UI** (after inspector filter, line 104):
- `const [scheduleFilter, setScheduleFilter] = useState<'all'|'programmed'|'to_coordinate'>('all')`
- Render 3 pill buttons: Todas / Programadas / Por coordinar

**Categorize inspections** (replace lines 82-83):
- `programmed` = has `scheduleDatetime`
- `toCoordinate` = no `scheduleDatetime`, has `contractEndDate`
- `unscheduled` = neither
- Apply `scheduleFilter` to determine what shows in grid vs sections

**Add day-header coordination row** (between header row and first hour row):
- For each weekDay, collect `toCoordinate` items whose `contractEndDate` falls on that day
- Render a special row (auto-height, min-h-10) with amber/warning background, dashed border
- Each item shows: property name + "Por coordinar · Término: <date>" + inspector name
- This row only renders if any day has coordination items

**Split bottom section** into two:
- "Por coordinar (N)" — items with `contractEndDate` but not in current week grid, sorted by nearest contract-end
  - Cards show: property, address, "Término de contrato: date", "Por coordinar" badge, inspector
- "Sin programar (N)" — items with neither date
  - Cards show: property, address, status badge, inspector

### 2. `src/pages/executive/ExecutiveSchedule.tsx`

Same changes as Admin: extend data model, add filter toggle, day-header coordination row, split bottom section. Identical logic, different layout wrapper and link paths (`/executive/inspection/`).

### 3. `src/pages/inspector/InspectorCalendar.tsx`

**Extend `AgendaInspection`** with `contractEndDate: Date | null`.

**Add filter toggle** (3 pills: Todas / Programadas / Por coordinar) below date selector.

**Day matching logic:**
- `programmed` filter: show items where `scheduleDatetime` matches selected day
- `to_coordinate` filter: show items where `contractEndDate` matches selected day
- `all`: combine both

**Card rendering for uncoordinated items in day view:**
- Amber/warning card style, "Por coordinar" badge
- "Término de contrato: <date>" as primary info
- WhatsApp + Cargar fecha CTAs
- No progress bar

**Unscheduled section** at bottom: split into Por coordinar (sorted by nearest contract-end) and Sin programar.

### 4. `src/pages/inspector/InspectorDashboard.tsx`

**Por coordinar section** — sort by nearest `contractEndDate`. Already partially done; verify ordering is correct.

**Cards** — ensure "Término de contrato" label (not "ref.") and no progress emphasis for uncoordinated items.

### 5. `src/components/PropertyBriefingCard.tsx`

**Relabel** any remaining "Término contrato (ref.)" → "Término de contrato". (Quick check — may already be done from prior pass.)

---

## Visual Spec for Calendar Coordination Items

```text
┌─────────────────────────────────────────────────┐
│ Day header row (normal)                         │
├─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┤
│ ┌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┐ │
│ ╎ 🟡 Por coordinar                           ╎ │  ← amber bg, dashed border
│ ╎ Chacabuco 1120 · Término: 20 mar            ╎ │  ← explicit text
│ └╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┘ │
├─────────────────────────────────────────────────┤
│ 8:00  │ [Scheduled item - solid bg]            │  ← real appointment
│ 9:00  │                                        │
```

Programmed items: solid `bg-primary/10`, no "Por coordinar" label.
Coordination items: `bg-amber-50 border-dashed border-amber-300`, explicit "Por coordinar" + "Término de contrato: date" text.

---

## Files Summary

| Action | File |
|---|---|
| Edit | `src/pages/admin/AdminSchedule.tsx` — dual-date, filter, day-header row, split sections |
| Edit | `src/pages/executive/ExecutiveSchedule.tsx` — same as admin |
| Edit | `src/pages/inspector/InspectorCalendar.tsx` — dual-date filter, card patterns |
| Edit | `src/pages/inspector/InspectorDashboard.tsx` — verify sort + label consistency |
| Edit | `src/components/PropertyBriefingCard.tsx` — verify label (may be no-op) |

5 file changes. No migrations.

