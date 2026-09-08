ALTER TABLE public.inspection_source_events
  DROP CONSTRAINT IF EXISTS inspection_source_events_failure_reason_check;

ALTER TABLE public.inspection_source_events
  ADD CONSTRAINT inspection_source_events_failure_reason_check
  CHECK (failure_reason IS NULL OR failure_reason IN (
    'payload_validation',
    'normalization',
    'inspection_creation',
    'assignment_resolution',
    'structure_generation',
    'inspection_insert',
    'sections_insert',
    'field_values_insert',
    'unknown'
  ));