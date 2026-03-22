

# Plan: Admin Operational Workflow Orchestrator

## Overview

Replace the current simple Admin Inspection Detail page with a full lifecycle orchestration view. Add an audit log table for state changes.

---

## 1. Database Migration: `inspection_audit_log`

```sql
CREATE TABLE public.inspection_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  previous_status text,
  new_status text,
  action text NOT NULL,
  performed_by uuid REFERENCES profiles(id),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.inspection_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage audit log" ON public.inspection_audit_log
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));
```

---

## 2. Rewrite `AdminInspectionDetail.tsx`

### Top Summary Bar
Property name, property ID, current status badge, inspector name, executive name, scheduled date/time.

### Workflow Timeline (vertical stepper)
10 stages rendered as a vertical timeline. Each stage shows:
- Stage name
- Status indicator (completed / current / pending)
- Timestamp (from inspection record fields: `created_at`, `started_at`, `completed_at`, `approved_at`, etc.)
- Responsible user
- Available action button(s)

Stages and their data sources:

| # | Stage | Status logic | Actions |
|---|---|---|---|
| 1 | Payload recibido | `source_event_id` exists | View payload (expandable JSON) |
| 2 | Inspección generada | `sections.length > 0` | Regenerate sections (destructive, with confirm) |
| 3 | Asignación completa | `inspector_id && executive_id` both set | Assign/reassign dropdowns |
| 4 | Ejecución inspector | status >= `in_progress` | View section progress |
| 5 | Enviada a revisión | status >= `submitted` | Force submit if stuck |
| 6 | Revisión ejecutivo | status >= `in_review` | View review state |
| 7 | Presupuesto | repair items exist | View budget summary |
| 8 | Publicación | report version exists | Publish / republish |
| 9 | URL propietario | `public_token` exists | Show URL + copy button |
| 10 | Enviada/Compartida | status === `sent` | Mark as sent |

### Detail Tabs (below timeline)
Four tabs using the existing Tabs component:

1. **Payload** — Shows `property_snapshot_json` and source event `payload_json` as formatted JSON viewers
2. **Inspección** — Sections list with status badges, progress bar, field values summary per section
3. **Revisión Ejecutivo** — Per-section: final observation, internal notes, photo count, repair items count
4. **Presupuesto & Publicación** — Budget table (repairs grouped by section with subtotals/total), published versions list, copy link CTA

### Admin Actions
Each action that changes status will:
1. Update the inspection record
2. Insert a row into `inspection_audit_log` with previous/new status, `performed_by = auth.uid()`, and optional note
3. Refresh local state

Key actions:
- **Assign/Reassign** inspector and executive (inline dropdowns + save)
- **Force advance status** — dropdown of valid next statuses + confirm dialog
- **Regenerate sections** — calls `generateSections()` from payload, deletes old sections/fields, creates new ones (confirm dialog, destructive)
- **Publish/Republish** — builds `normalized_payload`, creates new version with `is_latest`, copies URL
- **Mark as sent** — sets status to `sent`
- **Copy owner URL** — constructs `/reportes/{property_id}/{public_token}` client-side

### Audit Log Panel
Collapsible section at the bottom showing all `inspection_audit_log` entries for this inspection, ordered by `created_at desc`. Shows: action, previous → new status, user name, timestamp, note.

---

## 3. Data Fetching

On mount, fetch in parallel:
- `inspections` by id (with joined profiles for inspector/executive names via separate query)
- `inspection_sections` for this inspection
- `inspection_field_values` for all section IDs
- `inspection_photos` for all section IDs
- `inspection_repair_items` for this inspection
- `inspection_report_versions` for this inspection
- `inspection_source_events` by `source_event_id`
- `inspection_reviews` for all section IDs
- `inspection_audit_log` for this inspection
- `profiles` (active, for assignment dropdowns)

---

## 4. Helper: `logAuditEntry`

A simple utility function used inline:
```ts
async function logAuditEntry(inspectionId, previousStatus, newStatus, action, performedBy, note?)
```

Called before every status-changing operation.

---

## Files Summary

| Action | File |
|---|---|
| Migration | Create `inspection_audit_log` table + RLS |
| Rewrite | `src/pages/admin/AdminInspectionDetail.tsx` |

2 changes total. No new routes needed (route already exists).

