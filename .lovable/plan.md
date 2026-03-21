

# Plan: Mobile Calendar, Admin Calendar, Progress Fix, Friction Reduction, Admin Improvements

## 1. Inspector Mobile Agenda Calendar

**New file:** `src/pages/inspector/InspectorCalendar.tsx`

Mobile agenda-style calendar grouped by date. Sections: "Hoy", "Mañana", "Próximas", "Sin programar". Each date group shows inspection cards with property name, address, time, status badge, "Abrir" and "Cómo llegar" CTAs.

**Changes:**
- Add route `/inspector/calendar` in `App.tsx`
- Update `InspectorBottomNav.tsx`: replace "Próximas" tab with a "Calendario" tab pointing to `/inspector/calendar` (icon: `CalendarDays`)
- Keep `/inspector` (dashboard) as the home with the hero card, but the bottom nav calendar tab goes to the dedicated agenda view

## 2. Admin Desktop Calendar (Google Calendar-inspired)

**Refactor:** `src/pages/admin/AdminSchedule.tsx`

Replace the current simple list with a week-view calendar layout:
- 7-column grid for the week (Mon–Sun)
- Time slots on left axis (8:00–20:00)
- Inspection cards positioned by scheduled time within day columns
- Each card shows property name, inspector name, status badge
- Navigation: previous/next week arrows, "Hoy" button
- Fallback: unscheduled inspections listed below the grid
- Filter by inspector dropdown

## 3. Fix Progress Bug — 100% Not Reached

**Root cause investigation needed.** The `calculateProgress` function looks correct. The likely bug is that when `handleMarkComplete` runs, the local `allSections` state is stale — it was fetched on mount but the section status update happens via DB only, and the progress on the dashboard/detail is calculated from a separate fetch.

**Fix in `InspectorSectionComplete.tsx`:**
- After `handleMarkComplete` succeeds, update the local `allSections` state to reflect the completed section before navigating away
- This ensures if the user goes back, the progress recalculates correctly

**Fix in `InspectorInspectionDetail.tsx`:**
- Re-fetch sections when the component mounts (already does this), but also when navigating back from section completion. Add a re-fetch trigger.

**Fix in progress display — green at 100%:**
- In `Progress` component usage across `InspectorDashboard`, `InspectorInspectionDetail`, and inspection cards: add conditional class `[&>div]:bg-[#238D7E]` when `progress.percent === 100`
- Also change the percentage text to green when 100%

## 4. Reduce Friction: Remove Confirmation + Toast on Step Completion

**Edit `InspectorSectionComplete.tsx`:**
- Remove the `AlertDialog` wrapping the "Completar" button (lines 439-461)
- Replace with a direct `Button` that calls `handleMarkComplete` immediately
- Remove `toast({ title: 'Sección completada' })` from `handleMarkComplete` (line 159)
- Keep the subtle inline state change (button becomes "Completada ✓" with secondary variant)
- Remove `toast({ title: 'Foto subida' })` (line 137) — photos already show visually in the grid

**Keep confirmation only for:**
- Photo delete (already has inline button, consider adding confirmation)
- Submit inspection (already has AlertDialog in detail page)

## 5. Admin Improvements: Filters, Search, Editing

**Edit `AdminInspections.tsx`:**

Add to the "All Inspections" tab:
- **Search input** for address and property ID (client-side filter on `address` and `property_id` fields)
- **Filter by inspector** dropdown (populate from profiles)
- **Filter by executive** dropdown (populate from profiles)
- Add status options: `needs_changes`, `published`, `sent` to the existing status filter
- Each inspection card gets a "Ver / Editar" button linking to a detail/edit view

**New file:** `src/pages/admin/AdminInspectionDetail.tsx`
- Admin inspection detail page at `/admin/inspections/:id`
- Shows all inspection data with editable fields:
  - Inspector/Executive assignment (dropdowns)
  - Scheduling fields (date/time)
  - Status override
- Section list with expandable section data
- Property snapshot (read-only)
- Route added to `App.tsx`

## 6. Better Admin Dashboard

**Edit `AdminDashboard.tsx`:**
- Fetch ALL inspections (remove `limit(10)`)
- Fetch profiles for inspector/executive names
- Add new stat cards: Total, Pending, In Progress, Submitted, Approved
- Add "Pending by Inspector" card: grouped count list
- Add "Pending by Executive" card: grouped count list
- Add "Upcoming Schedule" card: next 5 scheduled inspections
- Add "Unassigned Alerts" card: inspections missing assignment
- Each recent inspection card links to `/admin/inspections/:id`

## Files Summary

| Action | File |
|---|---|
| Create | `src/pages/inspector/InspectorCalendar.tsx` |
| Create | `src/pages/admin/AdminInspectionDetail.tsx` |
| Edit | `src/App.tsx` (2 new routes) |
| Edit | `src/components/InspectorBottomNav.tsx` (calendar tab) |
| Edit | `src/pages/admin/AdminSchedule.tsx` (week-view calendar) |
| Edit | `src/pages/inspector/InspectorSectionComplete.tsx` (remove confirmation dialog + toast) |
| Edit | `src/pages/inspector/InspectorInspectionDetail.tsx` (green progress at 100%) |
| Edit | `src/pages/inspector/InspectorDashboard.tsx` (green progress at 100%) |
| Edit | `src/pages/admin/AdminInspections.tsx` (search, filters, edit links) |
| Edit | `src/pages/admin/AdminDashboard.tsx` (operational dashboard) |

~10 files. No database migrations needed.

