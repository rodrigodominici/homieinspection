-- Patch get_published_report to append fecha_recoleccion_llaves from the
-- effective snapshot (property_overrides_json takes priority over
-- property_snapshot_json, mirroring getEffectiveSnapshot on the frontend).
--
-- This field is stored in inspection_field_values and mirrored to
-- property_overrides_json by the inspector flow — NOT in the direct
-- fecha_devolucion_llave column (which is never populated in production).
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
  v_fecha_recoleccion_llaves text;
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

  -- If the payload already has fecha_recoleccion_llaves (new publishes), use it.
  -- Otherwise fall back to reading it from the live inspection snapshot so that
  -- existing published reports also show the date without requiring a republish.
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

  RETURN result
    || jsonb_build_object('audience', COALESCE(v_audience, 'owner'))
    || jsonb_build_object('fecha_recoleccion_llaves', v_fecha_recoleccion_llaves);
END;
$function$;
