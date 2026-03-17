# Homie Inspection — Product & Technical Logic

> Internal documentation for the Homie Inspection MVP.  
> Last updated: 2026-03-17

---

## 1. Product Model

### What is an Inspection?

An **inspection** is a structured operational record that captures the condition of a property at a specific point in time (check-in or check-out). It is composed of:

- A **parent record** (`inspections`) with property metadata, assignment, and workflow status.
- **Dynamic sections** (`inspection_sections`) generated from property characteristics.
- **Field values** (`inspection_field_values`) that hold the actual data captured per section.
- **Photos** (`inspection_photos`) uploaded to Supabase Storage and linked in the database.
- **Reviews** (`inspection_reviews`) with comments from the executive during review.

### How is it Created?

1. A **source payload** arrives (currently manual from Admin, future: HubSpot webhook).
2. The payload is stored as-is in `inspection_source_events` for auditing.
3. The system normalizes a **property snapshot** (immutable at creation time).
4. **Dynamic sections** are generated based on property attributes (bedrooms, bathrooms, features).
5. A **parent inspection** record is created with `inspector_id`, `executive_id`, and `property_snapshot_json`.
6. Concrete section and field value rows are inserted.

### How is it Assigned?

- **`inspector_id`**: The inspector who will complete the inspection.
- **`executive_id`**: The executive who will review it after submission.
- Both are set at **creation time** (or via admin manual assignment).
- If assignment is incomplete, the inspection status is `pending_assignment`.

### How is it Completed?

1. The inspector opens the inspection in their mobile-first UI.
2. They complete each section (status chips, observations, photos).
3. Each section transitions: `not_started` → `in_progress` → `completed`.
4. When all sections are completed, the inspector can submit.
5. Submission sets status to `submitted` and `completed_at` timestamp.

### How is it Reviewed?

1. After submission, the inspection appears in the assigned executive's queue.
2. The executive reviews each section, viewing field values and photos.
3. The executive can:
   - **Approve** → status becomes `approved`, all sections marked `reviewed`.
   - **Return for changes** → specific sections marked `needs_changes` with comments.
4. If returned, the inspector sees revision requests and corrects the flagged sections.

---

## 2. Roles

### Admin

- Creates inspections from source payloads.
- Assigns inspectors and executives.
- Views all inspections and their statuses.
- Manages configuration (users, templates, external mappings).
- Can manually test each workflow step.

### Inspector

- Sees only inspections assigned to them (RLS: `inspector_id = auth.uid()`).
- Completes sections in a mobile-first, task-oriented interface.
- Uploads photos directly to Supabase Storage.
- Submits completed inspections for executive review.

### Executive

- Sees only inspections assigned to them (RLS: `executive_id = auth.uid()`).
- Reviews submitted inspections in a desktop-first, information-dense interface.
- Approves or returns inspections with section-level comments.

---

## 3. Core Entities

### `inspection_source_events`
Raw source payload storage. Every inspection traces back to a source event for auditing.

### `inspections`
Parent record with property metadata, assignments, status, and immutable property snapshot.

### `inspection_sections`
Dynamic sections generated from property data. Each has a status tracking completion.

### `inspection_field_values`
Individual field values within sections (status chips, text, numbers, dates).

### `inspection_photos`
Photos uploaded to Supabase Storage, linked to sections. Always persisted server-side.

### `inspection_reviews`
Comments from executives during review (revision requests, internal notes, final observations).

### `external_user_mappings`
Maps HubSpot identities (emails/user IDs) to internal Homie Inspection profiles. Used for auto-assignment when payloads arrive from HubSpot.

### `profiles`
Internal user profiles with role, email, and name. Created via auth trigger on signup.

---

## 4. Workflow

```
Source Payload → inspection_source_events
       ↓
Property Snapshot → inspections (parent record)
       ↓
Dynamic Sections → inspection_sections + inspection_field_values
       ↓
Inspector Completes → section status: not_started → in_progress → completed
       ↓
Inspector Submits → inspection status: submitted
       ↓
Executive Reviews → inspection status: in_review
       ↓
Approve → approved  |  Return → needs_changes (with section-level comments)
```

### Inspector → Executive Handoff

When the inspector submits, the inspection status changes to `submitted`. Because `executive_id` was set at creation time, the executive's RLS policy (`executive_id = auth.uid()`) makes the inspection visible in their query results. The executive dashboard filters for `submitted` and `in_review` statuses.

---

## 5. Progress Logic

Progress is calculated by the shared utility `calculateProgress()` in `src/lib/inspection-utils.ts`.

**Formula:**
- `total` = count of sections where `is_visible = true`
- `completed` = count of visible sections where status is `completed` OR `reviewed`
- `percent` = `Math.round((completed / total) * 100)`

**Statuses that do NOT count as completed:**
- `not_started`
- `assigned`
- `in_progress`
- `needs_changes`

---

## 6. Persistence Rules

- **Supabase is the source of truth** for all operational data.
- Inspections, sections, field values, photos, and reviews are always persisted server-side.
- Field values are saved on change (debounced) and on blur.
- The app must never depend on `localStorage` for critical operational data.
- Photos are uploaded immediately to Supabase Storage and linked in the database.

---

## 7. Storage Rules

- All photos are stored in the `inspection-photos` Supabase Storage bucket.
- Storage path convention: `inspections/{inspection_id}/{section_key}/{uuid}.{ext}`
- Photos are linked in `inspection_photos` with `storage_path` and `public_url`.
- **No local-only photo handling.** Every photo must be persisted server-side immediately.

---

## 8. Dynamic Section Generation

The generation logic lives in `src/lib/inspection-generator.ts`.

### Rules

| Property Attribute | Section Generated |
|---|---|
| Always | Property Data, Handover Person, Access, Kitchen, Appliances, Cleaning, Keys, Pest Control, Meters, Additional Info |
| `typology = Estudio` | Living/Dormitorio (instead of Living/Comedor) |
| `bedrooms_count = N` | Dormitorio 1..N (repeatable) |
| `bathrooms_count = N` | Baño 1..N (repeatable) |
| `has_terrace_living` | Terraza Living |
| `has_terrace_bedroom` | Terraza Dormitorio |
| `has_walking_closet` | Walking Closet |
| `has_logia` | Logia (with technical fields) |
| `has_storage \|\| has_parking` | Bodega y Estacionamiento |
| `has_front_yard && property_type = casa` | Antejardín |

### Future Architecture

The `inspection_templates`, `inspection_template_sections`, and `inspection_template_fields` tables already exist in the database. In the future, the generation logic will read rules from these tables instead of hardcoded TypeScript, allowing admin configuration of templates, visibility rules, and repeatable sections.

---

## 9. Current Testing Model (Manual Staged Workflow)

For this MVP stage, the admin can manually test each workflow step:

1. **Step 1 — Load Payload**: Admin pastes/selects a JSON payload and generates the inspection.
2. **Step 2 — Assign Users**: Admin selects inspector and executive from registered users.
3. **Step 3 — Inspector Completion**: Inspector uses their role-based UI to complete sections.
4. **Step 4 — Executive Review**: After inspector submits, inspection appears in executive's queue.

---

## 10. Future Model

- **HubSpot Integration**: Payloads will arrive automatically via webhook.
- **Auto-Assignment**: The system will resolve inspector/executive emails from HubSpot payloads using `external_user_mappings`.
- **Template Configuration**: Admins will manage templates and generation rules from the UI.
- **Report Generation**: Approved inspections will generate PDF/HTML reports via `inspection_report_versions`.

---

## 11. Current MVP Limitations

| Area | Current State | Future State |
|---|---|---|
| Payload ingestion | Manual from Admin | Automated via HubSpot webhook |
| User assignment | Manual selection by Admin | Auto-resolved from HubSpot emails |
| Section generation | Hardcoded in TypeScript | Configurable via template tables |
| Report generation | Not implemented | PDF/HTML from approved inspections |
| External user mapping | Table exists, no UI for CRUD | Full admin CRUD + auto-matching |
| Template management | Read-only documentation view | Full admin template builder |
