ALTER TABLE public.rent_manager_outbox ADD COLUMN report_tokens jsonb NOT NULL DEFAULT '{}';
CREATE OR REPLACE FUNCTION public.rm_report_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE client numeric; cost numeric; d public.inspection_quotation_discounts; eid uuid; tokens jsonb;
BEGIN
 IF NEW.status <> 'published' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND (NEW.status,NEW.public_token) IS NOT DISTINCT FROM (OLD.status,OLD.public_token) THEN RETURN NEW; END IF;
 SELECT COALESCE(sum(unit_price*quantity),0),COALESCE(sum(contractor_unit_price*quantity),0) INTO client,cost FROM public.inspection_repair_items WHERE inspection_id=NEW.inspection_id AND NOT is_pending_quote AND NOT is_archived;
 SELECT * INTO d FROM public.inspection_quotation_discounts WHERE inspection_id=NEW.inspection_id AND is_active LIMIT 1;
 IF d.id IS NOT NULL THEN client:=greatest(0,client-CASE WHEN d.discount_type='percentage' THEN client*d.discount_value/100 ELSE d.discount_value END); END IF;
 SELECT COALESCE(jsonb_object_agg(audience,public_token),'{}') INTO tokens FROM (SELECT DISTINCT ON(audience) audience,public_token FROM public.inspection_report_versions WHERE inspection_id=NEW.inspection_id AND status='published' ORDER BY audience,version_number DESC) versions;
 eid:=public.rm_enqueue(NEW.inspection_id,'inspection.report_published',jsonb_build_object('report_url',NULL,'owner_url',NULL,'quotation',jsonb_build_object('client_amount',round(client),'contractor_cost',round(cost),'currency','CLP')));
 IF eid IS NOT NULL THEN UPDATE public.rent_manager_outbox SET report_tokens=tokens WHERE id=eid; END IF;
 RETURN NEW;
END $$;
