

# Plan: Inspector Mobile-Native Redesign

## Summary

Redesign the Inspector experience as a mobile-native fieldwork app. Restructure IA to 4 tabs (Hoy, Agenda, Inspecciones, Perfil), rewrite the "Hoy" dashboard as a task-oriented home screen, add a horizontal-day agenda view, and polish the inspection detail + section screens with softer visuals and bigger touch targets. 6 file changes, no migrations.

---

## 1. Update Bottom Nav (`src/components/InspectorBottomNav.tsx`)

Change tabs from `[Calendario, Pasadas, Inspecciones, Perfil]` to:
- **Hoy** (`/inspector`, `Home` icon) — primary dashboard
- **Agenda** (`/inspector/agenda`, `CalendarDays` icon) — day-by-day schedule
- **Inspecciones** (`/inspector/all`, `ClipboardList` icon) — all inspections list
- **Perfil** (`/inspector/profile`, `User` icon)

Remove `Pasadas` as a top-level tab. Past inspections become a filter/section inside `Inspecciones`.

Update `activeKey` matching to include `/inspector/agenda` and sub-routes like `/inspector/inspection/`.

---

## 2. Rewrite "Hoy" Dashboard (`src/pages/inspector/InspectorDashboard.tsx`)

Replace the current "Próximas" screen with a true mobile dashboard:

**Header**: Greeting + current date (`Hoy, lunes 29 mar`) — warm, personal feel. No logo block.

**Sections in order**:
1. **Next inspection hero card** — large, prominent, with property name, time, address, progress ring (circular or bar), and primary CTA (`Iniciar` / `Continuar`). Soft gradient background on card.
2. **Today's summary modules** — 2x2 grid of stat tiles:
   - `Hoy` (count scheduled today)
   - `En progreso` (active count)
   - `Completadas hoy` (finished today count)
   - `Pendientes` (total pending)
3. **Today's schedule** — compact list of today's inspections as mini cards (time + property + status badge). If none today, show friendly empty state.
4. **Needs attention** — if any inspection has `needs_changes`, show a highlighted card.

**Visual style**: `bg-muted/30` page background, rounded-3xl cards, soft shadows, generous padding (p-5 on cards), larger text for hero.

---

## 3. Create Agenda Screen (`src/pages/inspector/InspectorCalendar.tsx` — rewrite)

Replace the current grouped-by-date calendar with a proper mobile agenda:

**Horizontal day selector**: A scrollable row of day pills showing the next 14 days. Each pill shows weekday abbreviation + day number. Selected day is highlighted with primary bg. Today has a dot indicator.

**Day content**: Below the selector, show inspection cards for the selected day. Cards include:
- Time pill (if scheduled)
- Property name + address
- Status badge
- Progress bar
- CTA: `Iniciar` / `Continuar` / `Ver`

If no inspections for the selected day, show empty state.

Keep the existing `groupByDate` + `getScheduleDatetime` logic.

---

## 4. Merge Past into All Inspections (`src/pages/inspector/InspectorAllInspections.tsx`)

Add a simple toggle/filter at the top: **Activas** | **Pasadas**

- Active: shows `assigned`, `in_progress`, `needs_changes`
- Past: shows `submitted`, `in_review`, `approved`, `published`, `sent`

This replaces the separate `InspectorPastInspections` page.

---

## 5. Polish Inspection Detail (`src/pages/inspector/InspectorInspectionDetail.tsx`)

Refinements for mobile-native feel:

- **Property summary**: Softer card with address, comuna, key collection date/time. Large `Cómo llegar` button.
- **Progress**: Larger progress bar with animated fill. Clear `X de Y secciones` label.
- **Section list**: Each section card gets slightly more vertical padding, the "current" section gets a subtle pulse/glow indicator. Keep the numbered step UI but with larger touch targets (min-h-14 on each card).
- **Signature step**: When all sections complete and signature not resolved, show a prominent standalone card (not just the bottom bar button) explaining the signature requirement with a clear CTA.

---

## 6. Polish Section Screen (`src/pages/inspector/InspectorSectionComplete.tsx`)

Refinements:
- **Status chips**: Keep 2x2 grid with 56px min height (already done). Add slightly more gap (gap-3.5).
- **Photo area**: Make the photo grid 2-column instead of 3-column for larger thumbnails on mobile. Increase aspect ratio slightly.
- **Observation textarea**: Increase default rows from 3 to 4. Add placeholder with softer copy.
- **Bottom bar**: Keep current prev/complete/next pattern. Add subtle `safe-area-bottom` padding.

---

## 7. Route Updates (`src/App.tsx`)

- Add `/inspector/agenda` route pointing to `InspectorCalendar`
- Keep `/inspector/past` route working (redirect or keep component) for backward compatibility
- `/inspector` stays as `InspectorDashboard`

---

## Files Summary

| Action | File |
|---|---|
| Edit | `src/components/InspectorBottomNav.tsx` — new 4-tab IA |
| Rewrite | `src/pages/inspector/InspectorDashboard.tsx` — mobile dashboard with today focus |
| Rewrite | `src/pages/inspector/InspectorCalendar.tsx` — horizontal day selector + agenda cards |
| Edit | `src/pages/inspector/InspectorAllInspections.tsx` — add active/past filter toggle |
| Edit | `src/pages/inspector/InspectorInspectionDetail.tsx` — softer visuals, bigger targets |
| Edit | `src/pages/inspector/InspectorSectionComplete.tsx` — photo grid, spacing, safe area |
| Edit | `src/App.tsx` — add `/inspector/agenda` route |

7 file changes. No migrations.

