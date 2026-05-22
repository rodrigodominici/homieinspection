# Homie Inspection — Product & Technical Logic

> Internal documentation. Definitive source for entity models and
> workflow rules. **Last updated: 2026-05-22**.

---

## 1. Product Model

An **inspection** is a structured operational record that captures the
condition of a property at a specific point in time (check-in or
check-out). The product is built around a strict, sequential 4-stage
workflow:

```
inspection → review → budget → share
```

Each inspection is composed of:

- A **parent record** (`inspections`) with property metadata, assignment,
  scheduling, status and an immutable `property_snapshot_json`.
- **Dynamic sections** (`inspection_sections`) generated from property
  characteristics. Operational vs meta sections drive progress.
- **Field values** (`inspection_field_values`) holding actual data per
  section (status chips, text, numbers, dates, matrix items).
- **Photos** (`inspection_photos`) in the private `inspection-photos`
  Supabase Storage bucket, referenced by canonical `storage_path`.
- **Repair items** (`inspection_repair_items`) priced during the budget
  stage from a shared repair catalog with per-contractor pricing.
- **Reviews** (`inspection_reviews`) — executive comments
  (`revision_request`, `internal_note`, `final_observation`).
- **Tenant signature** (`inspection_signatures`) captured at closing.
- **Report versions** (`inspection_report_versions`) — published
  audience-scoped snapshots accessed via public token.

### Creation

1. A **source payload** arrives (manual from Admin, or HubSpot webhook).
2. The raw payload is stored in `inspection_source_events` for auditing.
3. The system normalizes a **property snapshot** (immutable at creation).
4. **Dynamic sections** are generated via the canonical generator
   (`supabase/functions/_shared/inspection-generator.ts`) mirrored in
   `src/lib/inspection-generator.ts`. Both must produce identical output
   for the same payload — enforced by `src/test/generator-parity.test.ts`.
5. The parent `inspections` row is inserted with `inspector_id`,
   `executive_id`, scheduling and `property_snapshot_json`.
6. Concrete section + field-value rows are inserted.

### Assignment

- `inspector_id`, `executive_id` are set at creation (or via Admin).
- External users (HubSpot) are resolved through `external_user_mappings`
  (email / external user id → internal `profiles.id`).
- Without complete assignment, status is `pending_assignment`.

### Completion (Inspector)

1. The inspector opens the inspection in the mobile-first UI.
2. They complete each section (status chips, observations, photos, matrix
   items). The status guard auto-promotes the inspection to
   `in_progress` on first edit.
3. Each section transitions: `not_started → in_progress → completed`.
4. Some sections are matrix-style (e.g. **Logia**, 8 items) where every
   item must be answered before the section can complete.
5. Mandatory photo gate (`photo-validation-gate`) blocks submission when
   evidence is missing.
6. Tenant signature is captured as a mandatory closing step (or skipped
   with a recorded reason).
7. On submit, status becomes `submitted` and `completed_at` is stamped.

### Review (Executive)

1. Submitted inspections appear in the assigned executive's queue
   (`pages/executive/ExecutiveReviewQueue.tsx`).
2. The executive workstation
   (`pages/executive/ExecutiveReviewDetail.tsx` + `review-detail/`
   sub-components) loads everything for one inspection via the React
   Query hook `modules/review/api/useReviewDetail.ts`.
3. The executive can edit field values, attach internal notes, write
   **final observations** (executive-owned, distinct from inspector
   observations) and decide per-photo visibility for the public report.
4. Repairs are added from the **repair catalog** with per-contractor
   pricing. Each item has a dual-price model:
   - **Client-facing price** (`unit_price`) shown in the public report.
   - **Internal contractor price** (`contractor_unit_price`) for margin.
5. Changing the contractor re-binds catalog-linked repair prices via
   `repairs.service.ts → rebindContractorPrices`.
6. Outcomes (`modules/review/api/inspection-actions.service.ts`):
   - **Approve** → `status = approved`, all sections set to `reviewed`.
   - **Request changes** → status `needs_changes`; selected sections set
     to `needs_changes` with a `revision_request` comment each.
   - **Publish** → atomically inserts owner + tenant
     `inspection_report_versions` rows sharing `version_number` and
     `normalized_payload`, marks previous versions `is_latest = false`,
     stamps `published_at`.

### Public report

- Accessed at `/reportes/:property_id/:public_token` (`pages/public/OwnerReport.tsx`).
- Server-side gate: `get_published_report` RPC requires both
  `public_token` and `property_id`.
- Photo URLs in `normalized_payload` are stored as `null` and exchanged
  for short-lived signed URLs (1h TTL) by the `sign-public-photo` edge
  function.
- Audience-scoped: owner and tenant reports share the same content but
  have distinct tokens.
- WhatsApp CTA pre-fills from `tenant_whatsapp` on the inspection.

---

## 2. Roles

### Admin
- Ingests payloads (manual + HubSpot intake).
- Approves new signups (`auth/approval-workflow`).
- Assigns roles, deactivates users, full operational intervention.
- Manages repair catalog, contractors (with pricing matrix),
  market tax settings, communication templates and rules.
- Can edit inspector data and override status (audited in
  `inspection_audit_log`).

### Inspector
- Sees only own inspections (RLS: `inspector_id = auth.uid()`).
- Mobile-native UI: 4-tab bottom nav, sticky action bars, flex-col CTAs.
- Inspector dashboard ranks inspections by operational urgency
  (`inspector-dashboard-logic`).

### Executive
- Sees only own inspections (RLS: `executive_id = auth.uid()`).
- Desktop-first workstation: sticky summary bar, side-by-side comparison,
  list + calendar review queue with 3-way filtering.

---

## 3. Core Entities

| Table | Purpose |
|---|---|
| `inspection_source_events` | Raw payloads + failure taxonomy (see ADR-001) |
| `inspections` | Parent record, metadata, assignment, status, snapshot, scheduling |
| `inspection_sections` | Dynamic sections with per-section status |
| `inspection_field_values` | Field values inside sections (chips, text, numbers, matrix) |
| `inspection_photos` | Storage references (`storage_path` canonical) + visibility |
| `inspection_repair_items` | Priced repairs (dual price: client vs contractor) |
| `inspection_reviews` | `revision_request` / `internal_note` / `final_observation` |
| `inspection_signatures` | Tenant signature or recorded skip reason |
| `inspection_report_versions` | Published audience-scoped report snapshots |
| `inspection_audit_log` | Manual status overrides + admin actions |
| `inspection_external_references` | External system refs (HubSpot ids, etc.) |
| `repair_catalog_items` + `repair_catalog_categories` | Shared repair catalog |
| `repair_catalog_item_contractor_prices` | Per-contractor pricing matrix |
| `contractors` | Active contractors |
| `market_tax_settings` | VAT config per market |
| `communication_templates` / `rules` / `deliveries` | Templated outbound comms |
| `inspection_templates` / `_sections` / `_fields` | Future template-driven generation |
| `external_user_mappings` | HubSpot identity → internal profile |
| `profiles` | Internal users (role, email, name) |
| `hubspot_sync_log` | HubSpot inbound/outbound sync trail |

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
Executive Reviews (auto in_review) → edits, internal notes, photo visibility
        ↓
Approve → approved      Request Changes → needs_changes (per-section)
        ↓
Budget → repair items priced (client + contractor)
        ↓
Publish → owner + tenant inspection_report_versions (is_latest = true)
        ↓
Share → public URLs /reportes/:property_id/:public_token
```

### Handoff

When the inspector submits, status becomes `submitted`. Because
`executive_id` was set at creation, the executive's RLS policy
(`executive_id = auth.uid()`) makes the inspection visible in their
queue, filtered for `submitted` + `in_review`.

---

## 5. Progress Logic

Progress is calculated by `calculateProgress()` in
`src/lib/inspection-utils.ts`.

- `total` = count of **operational** visible sections
  (meta sections — e.g. Property Data — are excluded).
- `completed` = sections whose status is `completed` OR `reviewed`.
- `percent` = `Math.round((completed / total) * 100)`.

Section completion criteria are pattern-based (see
`src/lib/section-completion.ts`): mandatory fields, matrix items all
answered, photo gate satisfied.

Statuses that do NOT count as completed: `not_started`, `assigned`,
`in_progress`, `needs_changes`.

---

## 6. Persistence Rules

- **Supabase is the source of truth** for all operational data.
- Field values save on change (debounced) and on blur via
  `useDebouncedAutosave`.
- Photos are uploaded immediately to private storage; the app never
  depends on `localStorage` for operational data.
- Offline retry handles transient photo upload failures.

---

## 7. Storage Rules

- Bucket `inspection-photos` is **private** (ADR-001).
- Canonical reference: `storage_path`
  (`inspections/{inspection_id}/{section_key}/{uuid}.{ext}`).
- `inspection_photos.public_url` is deprecated (column to be dropped
  after signed-URL flow is validated).
- Authenticated app reads use `createSignedUrl(path, 3600)`.
- Public report photos resolved by `sign-public-photo` edge function
  after the `get_published_report` RPC gate.
- Images compressed to JPEG client-side before upload.

---

## 8. Dynamic Section Generation

Lives in `src/lib/inspection-generator.ts` (client mirror) and
`supabase/functions/_shared/inspection-generator.ts` (canonical, used by
intake). Both must produce identical structures — enforced by
`src/test/generator-parity.test.ts`.

Driven exclusively by `property_type` (canonical values: `estudio`,
`departamento`, `casa`) per ADR-001. `typology` is removed from the
relational schema and must not be consumed by new code.

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
| `has_storage \|\| has_parking` | Bodega y Estacionamiento |
| `has_front_yard && property_type = casa` | Antejardín |

The form follows a 15-screen sequential V4 model on mobile.

### Template tables (future)

`inspection_templates`, `inspection_template_sections`,
`inspection_template_fields` already exist. The current generator is
hardcoded; future work moves rules into these tables for admin
configuration.

---

## 9. Scheduling & Key Collection

Dual-date operational model — three normalized date concepts (see
`inspection-date-definitions`):

- Scheduled inspection date.
- Actual / completed date.
- Key collection date.

The closing section persists to overrides via the date-synchronization
architecture (`tech/date-synchronization-architecture`).

---

## 10. Repair Catalog & Budgeting

- Shared `repair_catalog_items` grouped by `repair_catalog_categories`.
- `repair_catalog_item_contractor_prices` provides the spreadsheet-style
  per-contractor pricing matrix managed by Admin.
- On the inspection, `inspection_repair_items` snapshots the catalog
  fields (`title_snapshot`, `owner_friendly_name_snapshot`,
  `description_snapshot`, `category_snapshot`, `unit`, `pricing_type`)
  so price changes don't retro-mutate published reports.
- Dual price: `unit_price` (client) and `contractor_unit_price`
  (internal). `payer_role`, `payment_nature`, `visible_to_owner` control
  what surfaces in the public report.

---

## 11. Communications & Integrations

- **HubSpot intake**: `supabase/functions/hubspot-inspection-intake` —
  ingests payloads, resolves users via mappings, generates the
  inspection. Failure taxonomy in `inspection_source_events.failure_reason`
  (see ADR-001).
- **HubSpot updates**: `hubspot-update-inspection` (outbound).
- **Retry pipeline**: `recover-stalled-events`, `retry-source-event`,
  `retry-hubspot-sync` (uses `hubspot-retry-classifier`).
- **Templated comms**: `communication_templates` + `communication_rules`
  drive `communication_deliveries` (e.g. WhatsApp CTA pre-filled from
  `tenant_whatsapp`).

---

## 12. Auth & Roles

- Email + password via Supabase Auth.
- New signups require **Admin approval** before they can use the app.
- Roles are stored in a separate table and checked via security-definer
  function (never on `profiles`) to prevent privilege escalation.
- Admin can: Approve, Assign Role, Reject, Deactivate
  (`user-management-workflow`).

---

## 13. Public Reporting & Versioning

- Versioned per inspection (`version_number`, `is_latest`).
- Audience-scoped: separate owner + tenant rows sharing
  `version_number` and `normalized_payload`, distinct `public_token`.
- Draft vs Published states (`share-workflow-states`).
- Access via `(property_id, public_token)` pair.

---

## 14. Visual Identity

- Homie Indigo `#525EA2`, background `#F6F7FB`, primary surface `#EEF1F8`.
- Inter typography.
- Status tokens defined in `src/shared/ui/status-registry.ts`.
- All colors in HSL via design tokens (`index.css` + `tailwind.config.ts`).
- Inspector UI: 4-tab bottom nav, sticky action bars, flex-col CTAs.
- Executive UI: sticky summary bar, side-by-side comparison, list +
  calendar review queue.

---

## 15. Current Limitations

| Area | Current State | Future State |
|---|---|---|
| Section generation | Hardcoded in TS (canonical + mirror) | Template-table driven |
| Template management | Read-only | Full admin builder |
| Optimistic mutations | Refetch-after-write | Optimistic + selective invalidation |
| `inspection_photos.public_url` | Still on table (deprecated) | Drop after signed-URL flow validated |
