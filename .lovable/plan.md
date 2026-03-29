

# Plan: Executive Layout, Calendar, Sorting & Queue Refinements

## Summary
Create `ExecutiveLayout` mirroring Admin's sidebar pattern. Create `ExecutiveSchedule` from Admin's week-grid calendar. Refactor Queue with layout wrap, sort by `fecha_recoleccion_llaves`, localStorage persistence, and visible key date on cards. Wrap Detail in layout keeping back button. 5 file changes, no migrations.

---

## 1. Create `ExecutiveLayout` (`src/components/ExecutiveLayout.tsx`)

Same structure as `AdminLayout` — `SidebarProvider`, collapsible `Sidebar`, sticky header with `SidebarTrigger`. Differences:
- Subtitle: **"Ejecutivo"**
- Nav items: `Inspecciones` (`/executive`, `ClipboardList`), `Agenda` (`/executive/schedule`, `CalendarClock`)
- Extensible: nav items defined as array, easy to add future sections
- Same sign-out footer with profile name

---

## 2. Create `ExecutiveSchedule` (`src/pages/executive/ExecutiveSchedule.tsx`)

Port `AdminSchedule` week-grid wrapped in `ExecutiveLayout`. Same helpers (`getMonday`, `addDays`, `HOURS`, `DAY_LABELS`). Key differences:
- **Scheduling date**: explicitly uses `fecha_recoleccion_llaves` (from `getEffectiveSnapshot`) as primary, falling back to `scheduled_at`
- Links → `/executive/inspection/:id`
- Inspector filter: conditionally shown only if dataset contains >1 unique inspector
- Shows inspector name, status badge, and address on each calendar slot

---

## 3. Refactor `ExecutiveReviewQueue`

- Wrap in `<ExecutiveLayout>`, remove standalone header (logo + sign out)
- **Persist view/sort**: store `viewMode` and `sortKey` in `localStorage` (`executive-queue-view`, `executive-queue-sort`), initialize from storage
- **Sort dropdown** with clear labels:
  - `Última actividad` (default, `updated_at`)
  - `Recolección: próxima primero`
  - `Recolección: más lejana primero`
- Sort reads `fecha_recoleccion_llaves` from `getEffectiveSnapshot(insp)`. Nulls → end.
- **Card refinement**: show `fecha_recoleccion_llaves` explicitly labeled `Recolección de llaves: <date>` or `Sin fecha de recolección` so sorting is visually understandable
- Inspector on cards: keep explicit `Inspector: {name}` in metadata row

---

## 4. Wrap `ExecutiveReviewDetail` in `ExecutiveLayout`

- Replace standalone `min-h-screen` wrapper with `<ExecutiveLayout>`
- **Keep back button** (`ArrowLeft` + navigate to `/executive`) as contextual navigation inside the content area
- Content fills `flex-1 overflow-auto` from layout — 3-column workspace remains wide (sidebar is collapsible to icon)

---

## 5. Update `App.tsx`

- Add route `/executive/schedule` → `ProtectedRoute allowedRoles={['executive']}` → `ExecutiveSchedule`
- Add import

---

## Files Summary

| Action | File |
|---|---|
| Create | `src/components/ExecutiveLayout.tsx` — sidebar layout, extensible nav |
| Create | `src/pages/executive/ExecutiveSchedule.tsx` — week-grid calendar |
| Edit | `src/pages/executive/ExecutiveReviewQueue.tsx` — layout wrap, persisted sort/view, key date on cards |
| Edit | `src/pages/executive/ExecutiveReviewDetail.tsx` — layout wrap, keep back button |
| Edit | `src/App.tsx` — add executive schedule route |

5 file changes. No migrations.

