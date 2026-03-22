ALTER TABLE inspections
  ADD COLUMN current_stage text NOT NULL DEFAULT 'inspection',
  ADD COLUMN inspection_completed_at timestamptz,
  ADD COLUMN review_completed_at timestamptz,
  ADD COLUMN budget_completed_at timestamptz,
  ADD COLUMN published_at timestamptz,
  ADD COLUMN owner_url_generated_at timestamptz;