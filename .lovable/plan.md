

# Plan: Fix Section Completion Logic and Inspector Flow

## Overview

Centralize section completion validation into a reusable helper, fix the bottom bar UX, handle last-section finalization, and ensure submit updates `current_stage`.

---

## 1. New helper: `src/lib/section-completion.ts`

Create a centralized utility with:

```typescript
canCompleteSection(sectionType: string, fieldValues: FieldValue[]): { valid: boolean; reason?: string }
```

**MVP rules:**
- For standard sections: at least one `group_key === 'status'` field must have a non-null `value_text`
- Photos: optional
- Observations: optional
- If no status fields exist for the section type, completion is always allowed (non-standard sections)

Also export:
```typescript
isSectionCompleted(sectionStatus: string): boolean
// returns true if status is 'completed' or 'reviewed'
```

This replaces scattered inline checks across components.

---

## 2. `InspectorSectionComplete.tsx` — Bottom bar redesign

**Replace the current 3-button layout** (Anterior / Completar|Completada✓ / Siguiente) with:

### If section is NOT completed:
- Left: "Anterior" (disabled if first section)
- Right: "Completar sección" (primary). On click:
  1. Call `canCompleteSection()` — if invalid, show inline validation error (red text below status chips: "Selecciona un estado para continuar")
  2. If valid, save status to `completed`, then auto-advance to next section (or navigate to detail if last)

### If section IS already completed:
- Completion badge shown in the **header** next to section title (the existing `SectionStatusBadge` already does this)
- Left: "Anterior"
- Right: If last section → "Finalizar inspección" (navigates to detail page). Otherwise → "Siguiente"

### Validation feedback:
- Add a `validationError` state string
- Clear it when a status chip is selected
- Show it inline below the status chips card when set

---

## 3. `InspectorInspectionDetail.tsx` — Bottom CTA and submit logic

### Bottom bar:
- If `allCompleted` → show only "Revisar y enviar" as primary CTA (triggers submit dialog)
- If not all completed → show "Continuar Inspección" / "Iniciar Inspección" as today

### Submit handler update:
Add `current_stage` and `inspection_completed_at` to the update:
```typescript
await supabase.from('inspections').update({
  status: 'submitted',
  current_stage: 'review',
  inspection_completed_at: new Date().toISOString(),
  completed_at: new Date().toISOString(),
  submitted_by: profile?.id,
}).eq('id', inspection.id);
```

---

## 4. Progress and status consistency

- `calculateProgress` already filters by `is_visible` — no change needed
- `allCompleted` in detail page already uses `progress.completed === progress.total` — correct
- The `ensureInspectionStatusConsistency` guard already auto-transitions stale statuses to `in_progress` — correct
- Green progress bar at 100% already implemented — keep as-is

---

## Files Summary

| Action | File |
|---|---|
| Create | `src/lib/section-completion.ts` — `canCompleteSection()` + `isSectionCompleted()` |
| Edit | `src/pages/inspector/InspectorSectionComplete.tsx` — new bottom bar, inline validation, last-section handling |
| Edit | `src/pages/inspector/InspectorInspectionDetail.tsx` — conditional CTA, submit updates `current_stage` |

3 changes total.

