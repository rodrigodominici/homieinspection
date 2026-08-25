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
  'quien_repara',
].join(', ');

/**
 * Detail-view projection. Includes everything in the list projection plus the
 * `generated_structure_json` blob needed to render the inspection form.
 */
export const INSPECTION_DETAIL_COLUMNS = `${INSPECTION_LIST_COLUMNS}, generated_structure_json`;

/**
 * Projection for `profiles` lookups used by pickers, filters and user admin.
 * Keeps the payload to the fields the UI renders instead of `select('*')`.
 */
export const PROFILE_LIST_COLUMNS = [
  'id',
  'email',
  'full_name',
  'role',
  'is_active',
  'approval_status',
  'market',
  'country_code',
  'phone',
  'created_at',
  'updated_at',
].join(', ');

/**
 * Projection for `inspection_sections` detail views.
 */
export const SECTION_COLUMNS = [
  'id',
  'inspection_id',
  'template_section_id',
  'section_key',
  'section_title',
  'section_type',
  'sort_order',
  'status',
  'is_visible',
  'final_observation',
  'reviewed_by',
  'reviewed_at',
  'created_at',
  'updated_at',
].join(', ');

/**
 * Projection for `inspection_photos` — excludes the heavy `storage_path`? No, we
 * need it for signing, but we don't need `caption`? We do. Keep all fields used.
 */
export const PHOTO_COLUMNS = [
  'id',
  'inspection_id',
  'inspection_section_id',
  'field_key',
  'group_key',
  'storage_bucket',
  'storage_path',
  'public_url',
  'caption',
  'sort_order',
  'uploaded_by',
  'created_at',
  'visible_to_owner',
].join(', ');

/**
 * Projection for `inspection_reviews`.
 */
export const REVIEW_COLUMNS = [
  'id',
  'inspection_id',
  'inspection_section_id',
  'comment_type',
  'comment',
  'created_by',
  'created_at',
].join(', ');

/**
 * Projection for `inspection_repair_items`.
 */
export const REPAIR_COLUMNS = [
  'id',
  'inspection_id',
  'inspection_section_id',
  'repair_catalog_item_id',
  'title_snapshot',
  'owner_friendly_name_snapshot',
  'description_snapshot',
  'category_snapshot',
  'unit',
  'pricing_type',
  'quantity',
  'unit_price',
  'subtotal',
  'notes',
  'visible_to_owner',
  'sort_order',
  'created_by',
  'updated_by',
  'created_at',
  'updated_at',
  'contractor_unit_price',
  'payer_role',
  'payment_nature',
].join(', ');

/**
 * Projection for `contractors` pickers.
 */
export const CONTRACTOR_COLUMNS = [
  'id',
  'name',
  'country',
  'is_active',
  'created_at',
].join(', ');

/**
 * Projection for `repair_catalog_categories`.
 */
export const CATEGORY_COLUMNS = [
  'id',
  'name',
  'sort_order',
  'is_active',
  'created_at',
].join(', ');

/**
 * Projection for `repair_catalog_items`.
 */
export const ITEM_COLUMNS = [
  'id',
  'name',
  'owner_friendly_name',
  'category_id',
  'description',
  'unit',
  'pricing_type',
  'base_price',
  'currency',
  'market',
  'is_active',
  'internal_notes',
  'created_by',
  'updated_by',
  'created_at',
  'updated_at',
].join(', ');

/**
 * Projection for `repair_catalog_item_contractor_prices`.
 */
export const PRICE_COLUMNS = [
  'id',
  'repair_catalog_item_id',
  'contractor_id',
  'price',
  'currency',
  'created_at',
  'updated_at',
].join(', ');
