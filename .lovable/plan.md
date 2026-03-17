

# Homie Inspection — Final Adjustments Before Implementation

Eight targeted refinements to the existing plan. No structural changes — these are precision corrections.

---

## 1. Separate raw payload from normalized snapshot

- `inspection_source_events.payload_json` — stores the **exact** raw input (future: raw HubSpot webhook body). Never modified.
- `inspections.property_snapshot_json` — a **normalized** subset extracted at creation time containing only the property/context fields the app needs (address, typology, bedrooms_count, flags, etc.). Also immutable after creation, but shaped for app consumption.
- The generation engine reads from `payload_json`, extracts/normalizes, and writes the clean version to `property_snapshot_json`.

## 2. Add `last_active_at`

- `inspections` gets `last_active_at timestamptz nullable` alongside `last_active_section_id`.
- Updated on every autosave or section navigation.
- Used for "Continue where you left off" display and sorting.

## 3. `needs_changes` as valid section status

Section statuses become:
`not_started` | `in_progress` | `completed` | `needs_changes` | `reviewed`

This was implied but now explicitly included in the CHECK constraint.

## 4. Field ordering and runtime visibility

- `inspection_field_values.sort_order` — preserved from template at generation time, used for rendering order.
- `inspection_field_values.is_visible boolean default true` — added for runtime visibility toggling (e.g., conditional fields shown/hidden based on other selections without deleting the row).

## 5. Consistent `group_key` on photos

- `inspection_photos.group_key` already exists in the schema — confirm it's used consistently.
- Photo upload UI groups photos by `group_key` within a section (e.g., `status_photos`, `damage_photos`, `technical_photos`).
- Query pattern: filter by `inspection_section_id` + `group_key` to get the right photo set.

## 6. Observation ownership — confirmed

- Inspector's raw observation: stored in `inspection_field_values` where `group_key = 'observation'`.
- Executive's final publishable observation: stored in `inspection_sections.final_observation`.
- These are independent fields. Executive can approve the inspector's text as-is or write a different final version.
- Report generation (future) reads from `final_observation`.

## 7. Return flow — explicit re-submit

Flow:
1. Executive selects sections → writes `revision_request` comments → clicks "Return for Changes"
2. Flagged sections → `needs_changes`, inspection → `needs_changes`
3. Inspector sees flagged sections with executive comments
4. Inspector fixes each section, marks `completed`
5. "Re-submit for Review" button appears **only** when all `needs_changes` sections are back to `completed`
6. Inspector must explicitly tap "Re-submit" — no auto-submit
7. Inspection status → `submitted`

## 8. Drop `draft_saved` — use `in_progress` only

`draft_saved` is removed. The inspection workflow states become:

`pending` → `assigned` → `in_progress` → `submitted` → `in_review` → `approved` / `needs_changes` → (loop back to `submitted`) → `published` → `sent`

- `in_progress` covers both "just started" and "partially saved" — autosave makes the distinction meaningless.
- One fewer state to manage in transitions, UI badges, and RLS policies.

---

## Summary of schema deltas (vs. previous plan)

| Table | Field | Change |
|---|---|---|
| `inspections` | `last_active_at` | Add `timestamptz nullable` |
| `inspections` | status CHECK | Remove `draft_saved` |
| `inspection_sections` | status CHECK | Add `needs_changes`, add `reviewed` |
| `inspection_field_values` | `is_visible` | Add `boolean default true` |
| `inspection_field_values` | `sort_order` | Confirm `integer not null default 0` |

Everything else carries forward unchanged from the refined plan. Ready for Phase 1 implementation.

