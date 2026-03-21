

# Refined Plan: Full UX/UI + Product Refactor

## Overview

This plan incorporates all 8 refinements from the user's feedback into the previously approved architecture. No database changes needed.

---

## 1. Design System Foundation

**Files:** `src/index.css`, new `src/lib/design-tokens.ts`

- Update CSS custom properties to match the specified color tokens exactly:
  - Success: `#238D7E`, Warning: `#F6B248`, Danger: `#ED8735`, Neutral: `#736464`
  - Background: `#F6F7FB`, Primary soft: `#EEF1F8`
- Add radius scale tokens (10/12/16/24/32/999px)
- Add typography scale utilities
- Create `design-tokens.ts` for programmatic access

---

## 2. Admin IA Restructure

**Sidebar navigation with 4 items:** Dashboard, Inspections, Users, Settings

### 2a. AdminLayout (new `src/components/AdminLayout.tsx`)
- Fixed left sidebar with logo, nav items, sign out
- Content area to the right

### 2b. AdminDashboard (`/admin`)
- Stat cards + recent inspections summary
- Uses AdminLayout

### 2c. AdminInspections (`/admin/inspections`) — new file
Three clear sub-views via tabs or segmented control:
- **All Inspections** — full list with status filters
- **Pending Assignment** — inspections missing inspector/executive, with inline assignment UI
- **Manual Creation** — payload ingestion + generation (absorbs current AdminCreateInspection)

### 2d. AdminUsers (`/admin/users`) — refactored
Three sub-views via tabs:
- **Internal Users** — list/edit/activate profiles
- **HubSpot Links** — linked external mappings (currently in AdminMappings)
- **Unresolved Identities** — unlinked mappings needing admin action

Absorbs AdminMappings content. AdminMappings route removed.

### 2e. Settings (`/admin/settings`) — new file
Read-only visibility only. Two sections:
- **Current Generation Rules** — the existing AdminGenerationRules content rendered as structured cards (Fixed Sections, Repeatable Sections, Conditional Sections, Property-Based Rules). No editable template concepts.
- **Product Logic / Help** — link to docs/PRODUCT_LOGIC.md content or inline summary

AdminTemplates and AdminGenerationRules standalone routes removed.

### Route changes in App.tsx
- Add: `/admin/inspections`, `/admin/settings`
- Remove: `/admin/mappings`, `/admin/templates`, `/admin/generation-rules`, `/admin/create`
- Keep: `/admin/users`

---

## 3. Inspector Mobile-Native UX

### 3a. InspectorDashboard
- Full-bleed cards with larger touch targets
- Skeleton loaders while fetching
- Empty state illustration
- Progress always shows "X de Y secciones" + percentage

### 3b. InspectorInspectionDetail
- Property summary card
- Progress card
- Section list as tappable cards
- **Sticky bottom CTA = "Continuar"** (primary action always)
- "Enviar para Revisión" only appears as a secondary action in a final review/summary state when all sections are completed — not as the main sticky CTA

### 3c. InspectorSectionComplete
- Status chips: **2x2 grid, minimum 56px height, large selected state, single-tap** (current implementation uses `h-14` = 56px and grid-cols-2 — verify and enforce)
- Sticky bottom action bar (Anterior / Siguiente / Completar)
- Toast notifications for save/upload
- Confirmation dialog before "Completar Sección"
- Photo grid with upload states

---

## 4. Executive UX

### 4a. Rename ExecutiveDashboard → ExecutiveReviewQueue
- File: rename `src/pages/executive/ExecutiveDashboard.tsx` → `src/pages/executive/ExecutiveReviewQueue.tsx`
- Route stays `/executive`
- Page title: "Cola de Revisión"
- Structured table layout: property, market, typology, inspector, submitted date, status, Review CTA

### 4b. ExecutiveReviewDetail — improve with two-column layout on desktop
- Left sticky summary panel
- Right scrollable review feed

---

## 5. Progress + Status Consistency — Verify & Harden

**Do not treat as already solved.** Specific actions:

### 5a. Verify guard triggers in all paths
The `ensureInspectionStatusConsistency()` must run on:
- Chip change in InspectorSectionComplete ✓ (line 85)
- Mark complete in InspectorSectionComplete ✓ (line 168)
- Submit in InspectorInspectionDetail — **add guard call before submit**
- Dashboard/detail hydration — **add guard call on load** in InspectorDashboard and InspectorInspectionDetail when sections are fetched

### 5b. Add guard on data load
In InspectorDashboard: after fetching sections for each inspection, call `ensureInspectionStatusConsistency(insp.id)` if progress > 0 and status is stale.

In InspectorInspectionDetail: after fetching sections, call the guard.

### 5c. Verify with edge cases
- New inspection with 0 sections → status stays pending, progress 0% ✓
- Inspection with 1+ active sections → must be in_progress minimum
- All sections completed but not submitted → must be in_progress, not pending

---

## 6. Auth Flow
Current implementation is already resilient (profileLoading, retry, fallback states). Minor polish:
- Add skeleton loader in loading states instead of "Loading..." text

---

## 7. Update docs/PRODUCT_LOGIC.md
Add sections for:
- Manual staged testing model
- Admin IA structure rationale
- Current MVP limitations

---

## Files Summary

| Action | File |
|---|---|
| Create | `src/lib/design-tokens.ts` |
| Create | `src/components/AdminLayout.tsx` |
| Create | `src/pages/admin/AdminInspections.tsx` |
| Create | `src/pages/admin/AdminSettings.tsx` |
| Create | `src/pages/executive/ExecutiveReviewQueue.tsx` |
| Edit | `src/index.css` (design tokens) |
| Edit | `src/App.tsx` (routes) |
| Edit | `src/pages/admin/AdminDashboard.tsx` (use AdminLayout) |
| Edit | `src/pages/admin/AdminUsers.tsx` (add HubSpot tabs) |
| Edit | `src/pages/inspector/InspectorDashboard.tsx` (native UX + guard on load) |
| Edit | `src/pages/inspector/InspectorInspectionDetail.tsx` (sticky CTA = Continue, guard on load) |
| Edit | `src/pages/inspector/InspectorSectionComplete.tsx` (enforce 56px chips) |
| Edit | `src/pages/executive/ExecutiveReviewDetail.tsx` (two-column) |
| Edit | `docs/PRODUCT_LOGIC.md` |
| Delete | `src/pages/admin/AdminMappings.tsx` |
| Delete | `src/pages/admin/AdminTemplates.tsx` |
| Delete | `src/pages/admin/AdminGenerationRules.tsx` |
| Delete | `src/pages/admin/AdminCreateInspection.tsx` (absorbed into AdminInspections) |
| Delete | `src/pages/executive/ExecutiveDashboard.tsx` (replaced by ExecutiveReviewQueue) |

~18 files touched. No database migrations needed.

