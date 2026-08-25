ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS quien_repara text;

ALTER TABLE public.inspections
  DROP CONSTRAINT IF EXISTS inspections_quien_repara_check;

ALTER TABLE public.inspections
  ADD CONSTRAINT inspections_quien_repara_check
  CHECK (quien_repara IS NULL OR quien_repara IN ('homie', 'dueno', 'ninguno'));

-- Audit trail for quien_repara changes
CREATE OR REPLACE FUNCTION public.log_quien_repara_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.quien_repara, '') <> COALESCE(OLD.quien_repara, '') THEN
    INSERT INTO public.inspection_audit_log (inspection_id, action, note, performed_by)
    VALUES (
      NEW.id,
      'quien_repara_changed',
      COALESCE(OLD.quien_repara, 'sin definir') || ' -> ' || COALESCE(NEW.quien_repara, 'sin definir'),
      auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_quien_repara_change ON public.inspections;
CREATE TRIGGER trg_log_quien_repara_change
AFTER UPDATE OF quien_repara ON public.inspections
FOR EACH ROW EXECUTE FUNCTION public.log_quien_repara_change();