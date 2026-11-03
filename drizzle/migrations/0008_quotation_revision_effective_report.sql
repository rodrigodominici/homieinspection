ALTER TABLE public.quotation_work_order_revisions ADD COLUMN original_inspection_status text; ALTER TABLE public.quotation_work_order_revisions ADD COLUMN original_feedback_status text;
DO $$ DECLARE def text; BEGIN
SELECT pg_get_functiondef('public.start_quotation_revision(uuid)'::regprocedure) INTO def;
def:=replace(def,'INSERT INTO public.quotation_work_order_revisions(inspection_id,work_order_id,created_by) VALUES(p_inspection_id,w.id,auth.uid())','INSERT INTO public.quotation_work_order_revisions(inspection_id,work_order_id,created_by,original_inspection_status,original_feedback_status) SELECT p_inspection_id,w.id,auth.uid(),status,owner_feedback_status FROM public.inspections WHERE id=p_inspection_id'); EXECUTE def;
SELECT pg_get_functiondef('public.submit_quotation_revision(uuid,text)'::regprocedure) INTO def;
def:=replace(def,'result:=public.publish_quotation_version(r.inspection_id,payload);','result:=public.publish_quotation_version(r.inspection_id,payload); UPDATE public.inspections SET owner_feedback_status=COALESCE(r.original_feedback_status,''none'') WHERE id=r.inspection_id;'); EXECUTE def;
SELECT pg_get_functiondef('public.submit_quotation_revision_decisions(text,text,text,jsonb)'::regprocedure) INTO def;
def:=replace(def,'UPDATE public.quotation_work_order_revisions SET status=''resolved''','UPDATE public.inspections SET status=COALESCE(r.original_inspection_status,''published''),owner_feedback_status=COALESCE(r.original_feedback_status,''none'') WHERE id=r.inspection_id; UPDATE public.quotation_work_order_revisions SET status=''resolved'''); EXECUTE def;
END $$;
CREATE OR REPLACE FUNCTION public.quotation_revision_effective_payload(p_payload jsonb,p_revision_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE payload jsonb:=p_payload; sec jsonb; rr jsonb; sections jsonb:='[]'::jsonb; repairs jsonb; c public.quotation_work_order_changes%ROWTYPE; owner_total numeric:=0; tenant_total numeric:=0; amount numeric; subtotal numeric; discount_amount numeric:=0; owner_discount numeric; tenant_discount numeric; tax numeric:=0;
BEGIN
FOR sec IN SELECT x FROM jsonb_array_elements(payload->'sections') x LOOP
 repairs:='[]'::jsonb;
 FOR rr IN SELECT x FROM jsonb_array_elements(COALESCE(sec->'repairs','[]'::jsonb)) x LOOP
  SELECT * INTO c FROM public.quotation_work_order_changes WHERE revision_id=p_revision_id AND repair_item_id::text=rr->>'id';
  IF FOUND AND c.decision='rejected' THEN
   IF c.kind='add' THEN CONTINUE; END IF;
   rr:=rr||jsonb_build_object('name',c.before_json->>'title_snapshot','description',c.before_json->>'description_snapshot','quantity',c.before_json->'quantity','unit_price',c.before_json->'unit_price','unit',c.before_json->>'unit','payer_role',c.before_json->>'payer_role','payment_nature',c.before_json->>'payment_nature','is_pending_quote',COALESCE((c.before_json->>'is_pending_quote')::boolean,false));
  END IF;
  repairs:=repairs||jsonb_build_array(rr);
 END LOOP;
 FOR c IN SELECT * FROM public.quotation_work_order_changes WHERE revision_id=p_revision_id AND kind='remove' AND decision='rejected' AND before_json->>'inspection_section_id'=sec->>'id' LOOP
  repairs:=repairs||jsonb_build_array(jsonb_build_object('id',c.repair_item_id,'name',c.before_json->>'title_snapshot','description',c.before_json->>'description_snapshot','quantity',c.before_json->'quantity','unit_price',c.before_json->'unit_price','unit',c.before_json->>'unit','payer_role',c.before_json->>'payer_role','payment_nature',c.before_json->>'payment_nature','is_pending_quote',COALESCE((c.before_json->>'is_pending_quote')::boolean,false)));
 END LOOP;
 FOR rr IN SELECT x FROM jsonb_array_elements(repairs) x LOOP
  amount:=CASE WHEN COALESCE((rr->>'is_pending_quote')::boolean,false) THEN 0 ELSE COALESCE((rr->>'quantity')::numeric,0)*COALESCE((rr->>'unit_price')::numeric,0) END;
  IF rr->>'payer_role'='owner' THEN owner_total:=owner_total+amount; ELSE tenant_total:=tenant_total+amount; END IF;
 END LOOP;
 sections:=sections||jsonb_build_array(sec||jsonb_build_object('repairs',repairs));
END LOOP;
owner_total:=round(owner_total); tenant_total:=round(tenant_total); subtotal:=owner_total+tenant_total;
IF payload->'discount'->>'type'='percentage' THEN discount_amount:=round(subtotal*least(100,greatest(0,COALESCE((payload->'discount'->>'value')::numeric,0)))/100);
ELSE discount_amount:=round(COALESCE((payload->'discount'->>'value')::numeric,(payload->'discount'->>'amount')::numeric,0)); END IF;
discount_amount:=least(subtotal,greatest(discount_amount,0));tenant_discount:=CASE WHEN subtotal=0 THEN 0 ELSE round(discount_amount*tenant_total/subtotal) END;owner_discount:=discount_amount-tenant_discount;
IF COALESCE((payload->'tax_config'->>'enabled')::boolean,false) THEN tax:=round((owner_total-owner_discount)*COALESCE((payload->'tax_config'->>'percentage')::numeric,0)/100)+round((tenant_total-tenant_discount)*COALESCE((payload->'tax_config'->>'percentage')::numeric,0)/100); END IF;
payload:=payload||jsonb_build_object('sections',sections,'budget_total',subtotal,'quotation_totals',jsonb_build_object('subtotal',subtotal,'owner',owner_total,'tenant',tenant_total,'discount',discount_amount,'tax',tax,'total',subtotal-discount_amount+tax));
IF payload->'discount' IS NOT NULL AND payload->'discount'<>'null'::jsonb THEN payload:=jsonb_set(payload,'{discount}',payload->'discount'||jsonb_build_object('amount',discount_amount,'amount_owner',owner_discount,'amount_tenant',tenant_discount)); END IF;
RETURN payload;
END $$;
REVOKE ALL ON FUNCTION public.quotation_revision_effective_payload(jsonb,uuid) FROM PUBLIC,anon,authenticated;
DO $$ DECLARE def text; BEGIN
SELECT pg_get_functiondef('public.get_published_report(text,text)'::regprocedure) INTO def;
def:=replace(def,'RETURN result',E'IF result ? ''quotation_revision_id'' THEN\n IF EXISTS(SELECT 1 FROM public.quotation_work_order_revisions WHERE id=(result->>''quotation_revision_id'')::uuid AND status=''resolved'') THEN\n result:=public.quotation_revision_effective_payload(result,(result->>''quotation_revision_id'')::uuid);\n END IF;\n result:=result||jsonb_build_object(''quotation_revision_status'',(SELECT status FROM public.quotation_work_order_revisions WHERE id=(result->>''quotation_revision_id'')::uuid));\n END IF;\n RETURN result'); EXECUTE def;
END $$;
CREATE OR REPLACE FUNCTION public.guard_quotation_revision_version_update() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF current_user NOT IN ('postgres','service_role','supabase_admin') AND EXISTS(SELECT 1 FROM public.inspection_work_orders WHERE inspection_id=OLD.inspection_id) AND (TG_OP='DELETE' OR NEW.status IS DISTINCT FROM OLD.status OR NEW.is_latest IS DISTINCT FROM OLD.is_latest) THEN RAISE EXCEPTION 'use_quotation_revision'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END $$;
CREATE TRIGGER guard_quotation_revision_version_update BEFORE UPDATE OR DELETE ON public.inspection_report_versions FOR EACH ROW EXECUTE FUNCTION public.guard_quotation_revision_version_update();
CREATE OR REPLACE FUNCTION public.guard_work_item_access() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE w public.inspection_work_orders%ROWTYPE; iid uuid; BEGIN
 SELECT * INTO w FROM public.inspection_work_orders WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.work_order_id ELSE NEW.work_order_id END FOR UPDATE;
 IF current_setting('role',true)='authenticated' THEN
 IF public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'executive') THEN PERFORM public.authorize_quotation_revision(w.inspection_id);
 ELSIF w.contractor_id IS DISTINCT FROM public.current_contractor_id() OR w.status NOT IN ('in_progress','rejected') THEN RAISE EXCEPTION 'not_authorized'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END $$;
CREATE TRIGGER guard_work_item_access BEFORE INSERT OR UPDATE OR DELETE ON public.inspection_work_order_items FOR EACH ROW EXECUTE FUNCTION public.guard_work_item_access();
CREATE OR REPLACE FUNCTION public.guard_revision_finalization() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NEW.status='sent' AND EXISTS(SELECT 1 FROM public.quotation_work_order_revisions WHERE inspection_id=NEW.id AND status='awaiting_approval') THEN RAISE EXCEPTION 'quotation_change_awaiting_approval'; END IF; RETURN NEW; END $$;
CREATE TRIGGER guard_revision_finalization BEFORE UPDATE ON public.inspections FOR EACH ROW EXECUTE FUNCTION public.guard_revision_finalization();