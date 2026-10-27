CREATE OR REPLACE FUNCTION public.get_inspection_hubspot_deal_url(p_inspection_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_url text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM inspections i WHERE i.id = p_inspection_id
      AND upper(i.market) = 'MX' AND i.inspection_type = 'captacion'
      AND (i.inspector_id = auth.uid() OR i.executive_id = auth.uid()
           OR has_role(auth.uid(), 'admin')
           OR (has_role(auth.uid(), 'executive') AND user_has_market(auth.uid(), i.market)))
  ) THEN RETURN NULL; END IF;
  SELECT e.payload_json #>> '{data,hubspot_deal_url}' INTO v_url
  FROM inspection_source_events e
  WHERE e.inspection_id = p_inspection_id AND e.source = 'hubspot'
  ORDER BY e.received_at DESC LIMIT 1;
  IF v_url IS NULL OR v_url NOT LIKE 'https://app.hubspot.com/%' THEN RETURN NULL; END IF;
  RETURN v_url;
END $$;
REVOKE ALL ON FUNCTION public.get_inspection_hubspot_deal_url(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_inspection_hubspot_deal_url(uuid) TO authenticated;