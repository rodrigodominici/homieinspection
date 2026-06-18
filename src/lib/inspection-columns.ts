/**
 * Column projection helpers for `inspections` queries.
 *
 * Avoid `select('*')` on list/dashboard endpoints — the `generated_structure_json`
 * column can weigh hundreds of KB per row and is never used outside the detail
 * view. Use these constants to make payloads predictable and smaller.
 */

/**
 * Columns required for inspector / executive / admin list & dashboard views.
 * Includes operational metadata and `property_snapshot_json` / `property_overrides_json`
 * (used by `getEffectiveSnapshot` for WhatsApp links, addresses, etc.) but excludes
 * the heavy `generated_structure_json` blob.
 */
export const INSPECTION_LIST_COLUMNS = [
  'id',
  'source_event_id',
  'template_id',
  'hubspot_property_id',
  'property_id',
  'market',
  'property_name',
  'address',
  'property_type',
  'inspection_type',
  'inspector_id',
  'executive_id',
  'contractor_id',
  'status',
  'current_stage',
  'scheduled_at',
  'started_at',
  'completed_at',
  'approved_at',
  'inspection_completed_at',
  'review_completed_at',
  'budget_completed_at',
  'published_at',
  'owner_url_generated_at',
  'property_snapshot_json',
  'property_overrides_json',
  'fecha_devolucion_llave',
  'fecha_devolucion_llave_sync_status',
  'last_active_section_id',
  'last_active_at',
  'created_by',
  'submitted_by',
  'approved_by',
  'created_at',
  'updated_at',
  'owner_feedback_status',
  'owner_feedback_last_submitted_at',
].join(', ');

/**
 * Detail-view projection. Includes everything in the list projection plus the
 * `generated_structure_json` blob needed to render the inspection form.
 */
export const INSPECTION_DETAIL_COLUMNS = `${INSPECTION_LIST_COLUMNS}, generated_structure_json`;
