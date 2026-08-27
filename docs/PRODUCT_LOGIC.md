# Homie Inspection — Product & Technical Logic

> Internal documentation. Definitive source for entity models and
> workflow rules. **Last updated: 2026-08-27**.

---

## 1. Product Model

An **inspection** is a structured operational record that captures the
condition of a property at a specific point in time. There are two
inspection **types** (`inspections.inspection_type`):

| Type | Meaning | Primary contact | Contract-date label |
|---|---|---|---|
| `check_out` | Tenant leaves the property | Inquilino | Fecha de término de contrato |
| `captacion` | Property intake / onboarding | Propietario | Fecha Tentativa de Recepción |

Labels are resolved centrally in `src/lib/inspection-type-labels.ts` —
never hardcode "check-out" wording in UI.

The product is built around a strict, sequential workflow:

```
inspection → review → budget → share → close
```

Each inspection is composed of:

- A **parent record** (`inspections`) with property metadata, assignment,
  scheduling, status, `quien_repara` flag and an immutable
  `property_snapshot_json`.
- **Dynamic sections** (`inspection_sections`) generated from property
  characteristics. Operational vs meta sections drive progress.
- **Field values** (`inspection_field_values`) holding actual data per
  section (status chips, text, numbers, dates, matrix items).
- **Photos** (`inspection_photos`) in the private `inspection-photos`
  Storage bucket, referenced by canonical `storage_path`.
- **Repair items** (`inspection_repair_items`) priced during the budget
  stage from a shared repair catalog with per-contractor pricing.
- **Quotation discounts** (`inspection_quotation_discounts`).
- **Reviews** (`inspection_reviews`) — executive comments
  (`revision_request`, `internal_note`, `final_observation`).
- **Tenant signature** (`inspection_signatures`), one row per inspection
  (`UNIQUE (inspection_id)`, written via `upsert`).
- **Report versions** (`inspection_report_versions`) — published
  audience-scoped snapshots accessed via public token.
- **Owner feedback** (`inspection_owner_feedback`,
  `inspection_owner_feedback_submissions`) — per-repair owner decisions.

### Creation

1. A **source payload** arrives (manual from Admin, or HubSpot webhook).
2. The raw payload is stored in `inspection_source_events` for auditing.
3. The system normalizes a **property snapshot** (immutable at creation)
   — includes `parking_number` and `storage_number`.
4. **Dynamic sections** are generated via the canonical generator
   (`supabase/functions/_shared/inspection-generator.ts`) mirrored in
   `src/lib/inspection-generator.ts`. Both must produce identical output
   for the same payload — enforced by `src/test/generator-parity.test.ts`.
5. The parent `inspections` row is inserted with `inspector_id`,
   `executive_id`, scheduling and `property_snapshot_json`.
6. Concrete section + field-value rows are inserted.

Deduplication is keyed on the source event. Deleting an inspection from
Admin also removes its `inspection_source_events` rows, otherwise the same
payload cannot be re-ingested.

### Assignment

- `inspector_id`, `executive_id` are set at creation (or via Admin).
- External users (HubSpot) are resolved through `external_user_mappings`
  (email / external user id → internal `profiles.id`).
- Status is `pending_assignment` ("Sin asignar") only while an id is
  actually missing; the Admin detail view auto-transitions the status once
  both are present.

### Completion (Inspector)

1. The inspector opens the inspection in the mobile-first UI.
2. They complete each section (status chips, observations, photos, matrix
   items). The status guard auto-promotes the inspection to
   `in_progress` on first edit.
3. Each section transitions: `not_started → in_progress → completed`.
4. Some sections are matrix-style (e.g. **Logia**, 8 items) where every
   item must be answered before the section can complete.
5. Mandatory photo gate blocks submission when evidence is missing.
   Photo uploads compress client-side, retry on transient failures and
   refresh the JWT before retrying on HTTP 400/401.
6. Tenant signature is captured as a mandatory closing step (or skipped
   with a recorded reason).
7. On submit, status becomes `submitted` and `completed_at` is stamped.

### Review, budget & publish (Executive)

1. Submitted inspections appear in the assigned executive's queue
   (`pages/executive/ExecutiveReviewQueue.tsx`), grouped by stage and
   auto-expanded when a filter is active.
2. The executive workstation (`ExecutiveReviewDetail.tsx` +
   `review-detail/`) loads everything via `useReviewDetail.ts`
   (React Query, centralized column projections, chunked fetching,
   batch-signed photo URLs refreshed every ~50 min).
3. The executive edits field values, adds internal notes, writes
   **final observations** (executive-owned, distinct from inspector
   observations), zooms photos in place and sets per-photo public
   visibility.
4. Repairs are added from the **repair catalog** with per-contractor
   pricing. Dual price model:
   - **Client-facing price** (`unit_price`) shown in the public report.
   - **Internal contractor price** (`contractor_unit_price`) for margin.
   Repairs are grouped as **Recomendados** (not "Obligatorias").
5. Changing the contractor re-binds catalog-linked prices via
   `repairs.service.ts → rebindContractorPrices`.
6. **Approve** → `status = approved`, sections set to `reviewed`, and
   `current_stage` advances to `share`.
7. **Publish** → atomically inserts owner + tenant
   `inspection_report_versions` rows sharing `version_number` and
   `normalized_payload`, marks previous versions `is_latest = false`,
   stamps `published_at`.
8. There is **no "request changes" flow**: once submitted, an inspection
   advances linearly toward publication.

### Owner feedback & close

- The published report lets the owner accept or comment per repair
  (`public.submit_owner_feedback`). Comments are **optional**.
- If the owner does not respond, the executive can force-close via
  `public.executive_force_close_owner_feedback` (audited in
  `inspection_audit_log`, actor column `performed_by`).
- **Finalizar inspección** (`public.finalize_inspection`, UI
  `FinalizeInspectionButton.tsx`) is available to **Admin and Executive**
  for inspections in `approved`, `accepted`, or `published` with
  `owner_feedback_status = 'accepted'`. It requires `quien_repara` to be
  set and moves status to `sent` ("Finalizado").

---

## 2. Statuses

`src/shared/ui/status-registry.ts` is the single source of truth. Labels
are type-agnostic (they never mention "check-out").

| DB status | Label |
|---|---|
| `pending_assignment` | Sin asignar |
| `pending` | Por coordinar |
| `assigned` | Coordinada |
| `in_progress` | En espera de Hallazgos |
| `submitted` / `in_review` | En gestión de cotización |
| `approved` / `published` | En gestión de aprobación |
| `accepted` | Aprobado |
| `sent` | Finalizado |

Section statuses: `not_started` (Pendiente), `in_progress` (En progreso),
`completed` (Completada), `reviewed` (Revisada).

### `quien_repara` — independent flag

Not a status. Values `homie` | `dueno` | `ninguno` (`null` = sin definir),
defined in `src/lib/quien-repara.ts`. It is **only editable inside the
"Finalizar inspección" action**; everywhere else it renders read-only via
`QuienReparaChip`. Changes are audited by the `log_quien_repara_change`
trigger.

### Buckets / KPIs

`src/lib/inspection-buckets.ts` derives every list and dashboard counter
so Admin and Executive views never drift. Stages: `unassigned`,
`inProgress`, `forReview`, `toPublish`, `waitingOwner`, `ownerFeedback`,
`accepted`, `finalized`. `sent` always wins over the owner-feedback
lifecycle, so finalized rows are never double counted.

Admin Inspections uses a **unified filtering axis**: clicking a KPI card
resets conflicting filters.

---

## 3. Roles

### Admin
- Ingests payloads (manual + HubSpot intake), can create inspections
  on demand.
- Approves new signups, assigns roles, deactivates users.
- Manages repair catalog, contractors (pricing matrix, duplicate
  contractor with prices), market tax settings, communication templates.
- Can edit inspector data, override status, finalize inspections and
  delete inspections (cascade, including storage objects).
- Dashboards: stage KPIs, "Carga por ejecutivo", "Aging de propietario",
  `get_executive_performance()` and `get_inspector_performance()` panels.
- Monitoring page (`/admin/monitoring`) for health, client errors and
  integration logs.

### Inspector
- Sees only own inspections (RLS `inspector_id = auth.uid()`).
- Mobile-native UI: 4-tab bottom nav, sticky action bars, flex-col CTAs.
- Dashboard ranks inspections by operational urgency and shows an
  inspection-type chip (Captación / Check-out).

### Executive
- Sees only own inspections (RLS `executive_id = auth.uid()`).
- Desktop-first workstation: sticky summary bar, side-by-side comparison,
  list + calendar queue with 3-way filtering.

### Comercial (read-only)
- Routes `/comercial` and `/comercial/check-out/:id`.
- Consultation + PDF download of published check-outs only, gated by
  `public.is_comercial()` and `public.is_visible_checkout_for_comercial()`.

Role checks always go through `public.has_role` / `get_user_role`
(security definer, roles never stored on `profiles`).

Deep links from Slack use `/inspections/:id`
(`InspectionRoleRedirect.tsx`) which routes each role to its own view.

---

## 4. Core Entities

| Table | Purpose |
|---|---|
| `inspection_source_events` | Raw payloads + failure taxonomy (ADR-001) |
| `inspections` | Parent record, metadata, assignment, status, `quien_repara`, snapshot, scheduling |
| `inspection_sections` | Dynamic sections with per-section status |
| `inspection_field_values` | Field values inside sections |
| `inspection_photos` | Storage references (`storage_path`) + visibility |
| `inspection_repair_items` | Priced repairs (client vs contractor price) |
| `inspection_quotation_discounts` | Quotation-level discounts |
| `inspection_reviews` | `revision_request` / `internal_note` / `final_observation` |
| `inspection_signatures` | Tenant signature (unique per inspection) or skip reason |
| `inspection_report_versions` | Published audience-scoped snapshots |
| `inspection_owner_feedback` (+ `_submissions`) | Per-repair owner decisions |
| `inspection_audit_log` | Status overrides, finalization, admin actions (`performed_by`) |
| `inspection_external_references` | External system refs (HubSpot ids) |
| `repair_catalog_items` / `_categories` | Shared repair catalog |
| `repair_catalog_item_contractor_prices` | Per-contractor pricing matrix |
| `contractors` | Active contractors |
| `market_tax_settings` | VAT config per market |
| `communication_templates` / `_rules` / `_deliveries` | Templated outbound comms |
| `inspection_templates` / `_sections` / `_fields` | Future template-driven generation |
| `profiles` | Internal users (role, email, name) |
| `hubspot_sync_log` | HubSpot inbound/outbound sync trail |
| `slack_notifications_log` | Slack notification trail |
| `client_error_log` | Client-side error telemetry |
| `system_health_state` | Health-check state for alerting |

### Database functions

`create_inspection_from_event`, `get_published_report`,
`submit_owner_feedback`, `executive_force_close_owner_feedback`,
`finalize_inspection`, `get_executive_performance`,
`get_inspector_performance`, `has_role`, `get_user_role`, `is_comercial`,
`is_visible_checkout_for_comercial`, `handle_new_user`,
`log_quien_repara_change`, `prevent_profile_privilege_escalation`.

---

## 5. Workflow

```
Source Payload → inspection_source_events
        ↓
Property Snapshot → inspections (parent record)
        ↓
Dynamic Sections → inspection_sections + inspection_field_values
        ↓
Inspector Completes → not_started → in_progress → completed
        ↓
Inspector Submits → submitted
        ↓
Executive Reviews (in_review) → edits, notes, photo visibility
        ↓
Approve → approved (current_stage = share)
        ↓
Budget → repair items priced (client + contractor)
        ↓
Publish → owner + tenant report versions (is_latest = true)
        ↓
Owner responds (or executive force-closes) → accepted
        ↓
Finalizar (quien_repara required) → sent
```

---

## 6. Progress Logic

`calculateProgress()` in `src/lib/inspection-utils.ts`:

- `total` = count of **operational** visible sections (meta sections
  excluded).
- `completed` = sections with status `completed` or `reviewed`.
- `percent` = `Math.round((completed / total) * 100)`.

Section completion criteria are pattern-based
(`src/lib/section-completion.ts`): mandatory fields, all matrix items
answered, photo gate satisfied.

---

## 7. Persistence, Storage & Search

- **Supabase (Lovable Cloud) is the source of truth** for all data.
- Field values save debounced on change and on blur
  (`useDebouncedAutosave`).
- Bucket `inspection-photos` is **private**; canonical reference
  `storage_path` = `inspections/{inspection_id}/{section_key}/{uuid}.{ext}`.
- Photos compressed to JPEG (max 1600px) in parallel before upload.
- Authenticated reads use batch `createSignedUrl` (1h TTL) with automatic
  refresh at ~50 min; public report photos are signed by
  `sign-public-photo` after the `get_published_report` gate.
- `inspection_photos.public_url` is deprecated.
- Search (`src/lib/inspection-search.ts`) is tokenized and
  accent-insensitive across address, property id, tenant/owner and
  assignee.

---

## 8. Dynamic Section Generation

Driven exclusively by `property_type` (`estudio`, `departamento`, `casa`)
per ADR-001. `typology` must not be consumed by new code.

| Property Attribute | Section Generated |
|---|---|
| Always | Datos de la propiedad, Persona en entrega, Acceso, Cocina, Electrodomésticos, Limpieza, Llaves, Plagas, Medidores, Otros Generales |
| `property_type = estudio` | Living/Dormitorio (instead of Living/Comedor) |
| `bedrooms_count = N` | Dormitorio 1..N |
| `bathrooms_count = N` | Baño 1..N |
| `has_terrace_living` | Terraza Living |
| `has_terrace_bedroom` | Terraza Dormitorio |
| `has_walking_closet` | Walking Closet |
| `has_logia` | Logia (8-item matrix) |
| `has_storage \|\| has_parking` | Bodega y Estacionamiento (with `storage_number` / `parking_number`) |
| `has_front_yard && property_type = casa` | Antejardín |

The form follows a 15-screen sequential V4 model on mobile.

---

## 9. Scheduling & Key Collection

Three normalized date concepts: scheduled inspection date, actual /
completed date, key collection date. The closing section persists to
overrides (date-synchronization architecture).

Calendars (Admin + Executive, `src/lib/schedule-helpers.ts`) render the
inspection date solid and the contract / tentative-reception date dashed,
with grouping per day.

---

## 10. Public Report

- Route `/reportes/:property_id/:public_token`
  (`pages/public/OwnerReport.tsx`).
- Server-side gate: `get_published_report` requires **both**
  `public_token` and `property_id`.
- Audience-scoped: owner and tenant reports share content, distinct
  tokens. Versioned (`version_number`, `is_latest`), Draft vs Published.
- Shows the budget breakdown (Recomendados), the **tenant signature**,
  and a WhatsApp CTA pre-filled from `tenant_whatsapp`.
- Owner can accept or comment per repair; comments optional.

---

## 11. Integrations & Notifications

- **HubSpot intake**: `hubspot-inspection-intake` — resolves users via
  mappings and generates the inspection. Failure taxonomy in
  `inspection_source_events.failure_reason` (ADR-001).
  `captacion` maps to HubSpot **Deals**, `check_out` to **Custom
  Objects**.
- **HubSpot updates**: `hubspot-update-inspection` (outbound).
- **Retry pipeline**: `recover-stalled-events`, `retry-source-event`,
  `retry-hubspot-sync` (`hubspot-retry-classifier`).
- **Slack**: `notify-executive-slack` posts to `#inspecciones-cl` as
  "Homie Inspection", linking to `/inspections/:id`.
- **Other functions**: `admin-create-user`, `homie-realty-lookup`,
  `sign-public-photo`, `health-check`.

---

## 12. Reliability & Performance

- `AuthContext` resolves session with a 6 s timeout; on backend failure
  the app renders `BackendUnavailable` instead of hanging.
- `useBackendHealth` + `BackendStatusBanner` surface backend outages;
  `health-check` + `system_health_state` back external monitoring.
- Route chunks load through `lazyWithRetry` to survive stale-bundle
  fetch failures.
- `version.json` is emitted at build time; `NewVersionPrompt` polls it
  against `APP_VERSION` and reloads on mismatch (stale-PWA guard).
- Global error handlers report to PostHog and `client_error_log`.
- Composite indexes cover the hot list/queue queries; RLS policies use
  InitPlan subselects (`(select auth.uid())`) to stay index-friendly.

---

## 13. Auth & Roles

- Email + password (Google provider available). New signups require
  **Admin approval** before using the app.
- Roles live in a separate table, checked via security-definer functions.
- Admin can Approve, Assign Role, Reject, Deactivate.

---

## 14. Visual Identity

- Homie Indigo `#525EA2`, background `#F6F7FB`, primary surface `#EEF1F8`.
- Inter typography; all colors as HSL design tokens (`index.css`,
  `tailwind.config.ts`).
- Status visuals only from `src/shared/ui/status-registry.ts`.
- Badges/chips use `whitespace-nowrap` to avoid collapsing.
- KPI cards share a fixed `min-h-[104px]` layout.
- Inspector UI: 4-tab bottom nav, sticky action bars, flex-col CTAs.
- Executive UI: sticky summary bar, side-by-side comparison, list +
  calendar queue.

---

## 15. Current Limitations

| Area | Current State | Future State |
|---|---|---|
| Section generation | Hardcoded in TS (canonical + mirror) | Template-table driven |
| Template management | Read-only | Full admin builder |
| Optimistic mutations | Refetch-after-write | Optimistic + selective invalidation |
| `inspection_photos.public_url` | Still on table (deprecated) | Drop after signed-URL flow validated |
| `fecha_de_termino_real_de_contrato` | Single DB column for both inspection types | Rename / split per type |
