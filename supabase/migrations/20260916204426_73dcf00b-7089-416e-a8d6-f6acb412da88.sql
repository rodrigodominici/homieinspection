CREATE OR REPLACE FUNCTION public.enforce_work_order_acceptance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'in_progress' AND NEW.accepted_at IS NULL THEN
    RAISE EXCEPTION 'work_order_not_accepted';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_work_order_acceptance ON public.inspection_work_orders;
CREATE TRIGGER trg_enforce_work_order_acceptance
BEFORE INSERT OR UPDATE ON public.inspection_work_orders
FOR EACH ROW EXECUTE FUNCTION public.enforce_work_order_acceptance();