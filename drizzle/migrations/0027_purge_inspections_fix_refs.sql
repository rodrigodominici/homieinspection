CREATE OR REPLACE FUNCTION public.purge_inspections(p_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_events uuid[]; v_count integer;
BEGIN
  SELECT coalesce(array_agg(DISTINCT e), '{}') INTO v_events FROM (
    SELECT source_event_id e FROM inspections WHERE id = ANY(p_ids) AND source_event_id IS NOT NULL
    UNION SELECT id FROM inspection_source_events WHERE inspection_id = ANY(p_ids)
  ) s;
  UPDATE inspections SET rm_rescheduled_to = NULL WHERE rm_rescheduled_to = ANY(p_ids);
  DELETE FROM communication_deliveries WHERE inspection_id = ANY(p_ids);
  DELETE FROM hubspot_sync_log WHERE inspection_id = ANY(p_ids);
  DELETE FROM inspections WHERE id = ANY(p_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  DELETE FROM inspection_source_events WHERE id = ANY(v_events);
  RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION public.purge_inspections(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_inspections(uuid[]) TO service_role;