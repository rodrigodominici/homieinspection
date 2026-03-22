

# Plan: 4-Stage Workflow with Share as Final Stage

## Overview

Replace the 10-stage vertical timeline with a strict 4-stage model (`inspection` → `review` → `budget` → `share`). Add `current_stage` and milestone timestamps to the database. Rewrite the Admin Inspection Detail stepper and stage panels. Keep `sent` in legacy data but remove it from new UI transitions.

---

## 1. Database Migration

Add columns to `inspections`:

```sql
ALTER TABLE inspections
  ADD COLUMN current_stage text NOT NULL DEFAULT 'inspection',
  ADD COLUMN inspection_completed_at timestamptz,
  ADD COLUMN review_completed_at timestamptz,
  ADD COLUMN budget_completed_at timestamptz,
  ADD COLUMN published_at timestamptz,
  ADD COLUMN owner_url_generated_at timestamptz;
```

No enum constraint — just a text field. Allowed new values: `inspection`, `review`, `budget`, `share`. Legacy `sent` values in `status` field remain untouched.

---

## 2. Types Update (`src/lib/types.ts`)

- Add `current_stage` and 5 milestone timestamp fields to `Inspection` interface
- Keep `sent` in `InspectionStatus` for backward compatibility (legacy data)

---

## 3. Admin Inspection Detail — Full Rewrite

### Replace 10-stage `STAGES` with 4 stages

| Stage | Label | Completed | Current |
|---|---|---|---|
| `inspection` | Inspección | `inspection_completed_at` set | `current_stage === 'inspection'` |
| `review` | Revisión | `review_completed_at` set | `current_stage === 'review'` |
| `budget` | Presupuesto | `budget_completed_at` set | `current_stage === 'budget'` |
| `share` | Compartir | `published_at` set | `current_stage === 'share'` |

Exactly one stage is "current" at a time.

### Stage action buttons

- **Inspection**: "Completar inspección" → `current_stage='review'`, `inspection_completed_at=now()`, `status='in_review'`
- **Review**: "Completar revisión" → `current_stage='budget'`, `review_completed_at=now()`
- **Budget**: "Completar presupuesto" → `current_stage='share'`, `budget_completed_at=now()`
- **Share**: Two internal views:
  - **Pre-publish**: Shows report preview summary, "Publicar y generar URL" button. On click: creates report version, sets `published_at`, `owner_url_generated_at`, `status='published'`.
  - **Post-publish**: Shows green "Publicado" confirmation, generated URL, copy link button, open report link, version info. Optional "Republicar" action for future use.

### Remove from new UI

- `handleMarkSent` function
- `sent` from `ALL_STATUSES` array (force advance options)
- All 10 old stage definitions
- Old `owner_url` and `sent` stage entries

### Keep

- Top summary bar
- Admin actions bar (assignments, schedule, force advance — without `sent` option)
- Detail tabs (Payload, Inspección, Revisión, Presupuesto)
- Audit log panel
- `sent` stays in `InspectionStatus` type and `STATUS_ORDER` for backward compat with legacy data display

### Status sync on stage advancement

When `current_stage` changes, also update `status`:
- `inspection` → keeps current status (assigned/in_progress)
- `review` → `status = 'in_review'`
- `budget` → keeps `in_review`
- `share` (on publish) → `status = 'published'`

---

## 4. Executive Review Detail — Minor alignment

Remove any `sent`-related logic from new transitions. Ensure publish sets `status = 'published'` (not `sent`). No stage stepper added to executive view.

---

## Files Summary

| Action | File |
|---|---|
| Migration | Add `current_stage` + 5 timestamp columns to `inspections` |
| Edit | `src/lib/types.ts` — add new fields to Inspection |
| Rewrite | `src/pages/admin/AdminInspectionDetail.tsx` — 4-stage stepper with pre/post-publish Share |
| Edit | `src/pages/executive/ExecutiveReviewDetail.tsx` — remove `sent` from new transitions |

4 changes total.

