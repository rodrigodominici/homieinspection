CREATE OR REPLACE FUNCTION public.get_published_report(p_property_id text, p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  v_inspection_id uuid;
  v_audience text;
BEGIN
  SELECT irv.normalized_payload, irv.inspection_id, irv.audience
    INTO result, v_inspection_id, v_audience
  FROM inspection_report_versions irv
  JOIN inspections i ON i.id = irv.inspection_id
  WHERE irv.public_token = p_token
    AND i.property_id = p_property_id
    AND irv.status = 'published'
    AND irv.is_latest = true;

  IF result IS NULL THEN
    RETURN NULL;
  END IF;

  -- Photo URLs are intentionally NOT signed here. The published payload
  -- carries `{ id, url: null, caption }` per photo; the public renderer
  -- exchanges each id for a short-lived signed URL via the
  -- `sign-public-photo` edge function (auth-checked by token + property_id).
  RETURN result || jsonb_build_object('audience', COALESCE(v_audience, 'owner'));
END;
$function$;