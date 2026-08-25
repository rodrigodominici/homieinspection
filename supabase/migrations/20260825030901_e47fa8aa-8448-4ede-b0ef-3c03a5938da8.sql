REVOKE ALL ON FUNCTION public.log_quien_repara_change() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_published_report(p_property_id text, p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  v_inspection_id uuid;
  v_version_id uuid;
  v_audience text;
  v_fecha_recoleccion_llaves text;
  v_locked boolean := false;
  v_decisions jsonb := '[]'::jsonb;
  v_inspection_status text;
  v_owner_feedback_status text;
  v_signature jsonb;
  v_quien_repara text;
BEGIN
  SELECT irv.normalized_payload, irv.inspection_id, irv.audience, irv.id
    INTO result, v_inspection_id, v_audience, v_version_id
  FROM inspection_report_versions irv
  JOIN inspections i ON i.id = irv.inspection_id
  WHERE irv.public_token = p_token
    AND i.property_id = p_property_id
    AND irv.status = 'published'
    AND irv.is_latest = true;

  IF result IS NULL THEN
    RETURN NULL;
  END IF;

  IF result ? 'fecha_recoleccion_llaves' AND (result->>'fecha_recoleccion_llaves') IS NOT NULL THEN
    v_fecha_recoleccion_llaves := result->>'fecha_recoleccion_llaves';
  ELSE
    SELECT COALESCE(
      i.property_overrides_json->>'fecha_recoleccion_llaves',
      i.property_snapshot_json->>'fecha_recoleccion_llaves'
    )
      INTO v_fecha_recoleccion_llaves
    FROM inspections i
    WHERE i.id = v_inspection_id;
  END IF;

  SELECT i.status, i.owner_feedback_status, i.quien_repara
    INTO v_inspection_status, v_owner_feedback_status, v_quien_repara
  FROM inspections i WHERE i.id = v_inspection_id;

  SELECT EXISTS (
    SELECT 1 FROM inspection_owner_feedback f
    WHERE f.report_version_id = v_version_id
  ) INTO v_locked;

  IF v_locked THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'repair_item_id', f.repair_item_id,
      'decision', f.decision,
      'comment', f.comment
    )), '[]'::jsonb)
    INTO v_decisions
    FROM inspection_owner_feedback f
    WHERE f.report_version_id = v_version_id;
  END IF;

  IF (result->'signature') IS NULL OR (result->'signature'->>'signature_data') IS NULL THEN
    SELECT jsonb_build_object(
      'signer_name', s.signer_name,
      'signature_data', s.signature_data,
      'signed_at', s.signed_at
    )
      INTO v_signature
    FROM inspection_signatures s
    WHERE s.inspection_id = v_inspection_id
      AND s.signature_status = 'signed'
      AND s.signature_data IS NOT NULL
    LIMIT 1;
  ELSE
    v_signature := result->'signature';
  END IF;

  RETURN result
    || jsonb_build_object('audience', COALESCE(v_audience, 'owner'))
    || jsonb_build_object('fecha_recoleccion_llaves', v_fecha_recoleccion_llaves)
    || jsonb_build_object('version_id', v_version_id)
    || jsonb_build_object('inspection_id', v_inspection_id)
    || jsonb_build_object('owner_feedback_locked', v_locked)
    || jsonb_build_object('owner_decisions', v_decisions)
    || jsonb_build_object('inspection_status', v_inspection_status)
    || jsonb_build_object('owner_feedback_status', COALESCE(v_owner_feedback_status, 'none'))
    || jsonb_build_object('quien_repara', v_quien_repara)
    || jsonb_build_object('signature', v_signature);
END;
$function$;