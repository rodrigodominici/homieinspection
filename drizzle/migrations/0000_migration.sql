CREATE OR REPLACE FUNCTION public.with_unit_in_address(_text text, _unit text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE u text := nullif(btrim(coalesce(_unit,'')), '');
BEGIN
  IF _text IS NULL OR u IS NULL THEN RETURN _text; END IF;
  -- already contains the unit as a separate token -> no duplication
  IF _text ~* ('(^|[^0-9a-z])' || regexp_replace(u, '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g') || '($|[^0-9a-z])') THEN
    RETURN _text;
  END IF;
  IF position(',' in _text) > 0 THEN
    RETURN regexp_replace(_text, ',', ', D ' || u || ',');
  END IF;
  IF position(' - ' in _text) > 0 THEN
    RETURN regexp_replace(_text, ' - ', ', D ' || u || ' - ');
  END IF;
  RETURN _text || ', D ' || u;
END $$;

CREATE OR REPLACE FUNCTION public.apply_unit_to_inspection_address()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE u text := NEW.property_snapshot_json->>'unit_number';
BEGIN
  NEW.address := public.with_unit_in_address(NEW.address, u);
  NEW.property_name := public.with_unit_in_address(NEW.property_name, u);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_apply_unit_to_inspection_address ON public.inspections;
CREATE TRIGGER trg_apply_unit_to_inspection_address
BEFORE INSERT OR UPDATE OF address, property_name, property_snapshot_json ON public.inspections
FOR EACH ROW EXECUTE FUNCTION public.apply_unit_to_inspection_address();

UPDATE public.inspections SET address = address
WHERE coalesce(property_snapshot_json->>'unit_number','') <> '';