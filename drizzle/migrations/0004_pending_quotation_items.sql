ALTER TABLE public.inspection_repair_items ADD COLUMN is_pending_quote boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.inspection_repair_items.is_pending_quote IS 'Explicit pending price, excluded from totals, owner decisions and work orders.';
CREATE OR REPLACE FUNCTION public.validate_pending_quote() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
IF NEW.is_pending_quote THEN
 IF EXISTS (SELECT 1 FROM public.inspection_work_order_items WHERE repair_item_id=NEW.id) THEN RAISE EXCEPTION 'work_order_item_cannot_be_pending_quote'; END IF;
 NEW.unit_price := 0; NEW.contractor_unit_price := 0;
END IF;
RETURN NEW; END $$;
CREATE TRIGGER validate_pending_quote BEFORE INSERT OR UPDATE ON public.inspection_repair_items FOR EACH ROW EXECUTE FUNCTION public.validate_pending_quote();
DO $$ DECLARE definition text; BEGIN
SELECT pg_get_functiondef('public.assign_work_order(uuid,uuid)'::regprocedure) INTO definition;
IF position('WHERE r.inspection_id = p_inspection_id' in definition)=0 THEN RAISE EXCEPTION 'unexpected_assign_work_order_definition'; END IF;
definition := replace(definition, 'WHERE r.inspection_id = p_inspection_id', 'WHERE r.inspection_id = p_inspection_id AND NOT r.is_pending_quote');
EXECUTE definition;
SELECT pg_get_functiondef('public.submit_owner_feedback(text,text,text,jsonb)'::regprocedure) INTO definition;
IF position('WHERE rep ? ''id'' AND (rep->>''id'') IS NOT NULL' in definition)=0 THEN RAISE EXCEPTION 'unexpected_feedback_definition'; END IF;
definition := replace(definition, 'WHERE rep ? ''id'' AND (rep->>''id'') IS NOT NULL', 'WHERE rep ? ''id'' AND (rep->>''id'') IS NOT NULL AND NOT COALESCE((rep->>''is_pending_quote'')::boolean,false)');
EXECUTE definition;
END $$;