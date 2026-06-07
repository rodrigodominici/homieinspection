-- Performance indexes for common query patterns in the Executive workstation
-- and Inspector flows. All indexes are created concurrently to avoid locking.

-- inspection_sections: batch load by inspection (most common query)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inspection_sections_inspection_id
  ON inspection_sections (inspection_id)
  WHERE is_visible = true;

-- inspection_field_values: batch load by section
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inspection_field_values_section_id
  ON inspection_field_values (inspection_section_id, sort_order);

-- inspection_photos: batch load by section
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inspection_photos_section_id
  ON inspection_photos (inspection_section_id, sort_order);

-- inspection_repair_items: batch load by section
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inspection_repair_items_section_id
  ON inspection_repair_items (inspection_section_id, sort_order);

-- inspection_reviews: batch load by section
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inspection_reviews_section_id
  ON inspection_reviews (inspection_section_id, created_at);

-- inspection_report_versions: get latest published token for owner/tenant links
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_report_versions_inspection_latest
  ON inspection_report_versions (inspection_id, is_latest, audience)
  WHERE is_latest = true;

-- inspections: executive queue filters by status and org
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inspections_status_created
  ON inspections (status, created_at DESC);

-- inspection_photos: storage path lookups for deletion cascade
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inspection_photos_storage_path
  ON inspection_photos (storage_path)
  WHERE storage_path IS NOT NULL;

-- contractors: active contractor list (loaded on every review page open)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contractors_active_name
  ON contractors (is_active, name)
  WHERE is_active = true;
