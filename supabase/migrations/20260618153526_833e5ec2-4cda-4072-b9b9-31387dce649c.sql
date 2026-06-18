
-- Tier 1: composite indexes for hot query paths

-- inspections: dashboards filter by inspector/executive + status + date
CREATE INDEX IF NOT EXISTS idx_inspections_inspector_status_scheduled
  ON public.inspections (inspector_id, status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_inspections_executive_status_scheduled
  ON public.inspections (executive_id, status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_inspections_status_scheduled
  ON public.inspections (status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_inspections_property_id
  ON public.inspections (property_id);

-- inspection_sections: list ordered by sort_order, status checks
CREATE INDEX IF NOT EXISTS idx_inspection_sections_inspection_sort
  ON public.inspection_sections (inspection_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_inspection_sections_inspection_status
  ON public.inspection_sections (inspection_id, status);

-- inspection_field_values: typically queried by section, optionally filtered by visibility/sort
CREATE INDEX IF NOT EXISTS idx_inspection_field_values_inspection
  ON public.inspection_field_values (inspection_id);
CREATE INDEX IF NOT EXISTS idx_inspection_field_values_section_sort
  ON public.inspection_field_values (inspection_section_id, sort_order);

-- inspection_photos: per-inspection lookups + ordering
CREATE INDEX IF NOT EXISTS idx_inspection_photos_inspection
  ON public.inspection_photos (inspection_id);
CREATE INDEX IF NOT EXISTS idx_inspection_photos_inspection_section
  ON public.inspection_photos (inspection_id, inspection_section_id);

-- inspection_repair_items: per-inspection / per-section access
CREATE INDEX IF NOT EXISTS idx_inspection_repair_items_inspection
  ON public.inspection_repair_items (inspection_id);
CREATE INDEX IF NOT EXISTS idx_inspection_repair_items_inspection_section
  ON public.inspection_repair_items (inspection_id, inspection_section_id);

-- inspection_signatures: per-inspection
CREATE INDEX IF NOT EXISTS idx_inspection_signatures_inspection
  ON public.inspection_signatures (inspection_id);

-- inspection_audit_log: per-inspection chronological order
CREATE INDEX IF NOT EXISTS idx_inspection_audit_log_inspection_created
  ON public.inspection_audit_log (inspection_id, created_at DESC);

-- inspection_source_events: processing pipeline + chronological listing
CREATE INDEX IF NOT EXISTS idx_inspection_source_events_status_received
  ON public.inspection_source_events (processing_status, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_inspection_source_events_inspection
  ON public.inspection_source_events (inspection_id);
