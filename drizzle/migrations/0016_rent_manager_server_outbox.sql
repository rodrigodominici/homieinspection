CREATE TABLE public.rent_manager_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), inspection_id uuid NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,
 rm_inspection_id text NOT NULL, external_object_id text NOT NULL,
 event_id text NOT NULL UNIQUE DEFAULT ('hi_evt_' || gen_random_uuid()::text), event_type text NOT NULL, payload jsonb NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','error','skipped')),
 attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz DEFAULT now(), last_error text, response_status integer, response_body jsonb,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), sent_at timestamptz, sending_at timestamptz, claim_id uuid,
 photo_objects jsonb NOT NULL DEFAULT '[]', simulated_at timestamptz, simulated_response jsonb
);
GRANT SELECT ON public.rent_manager_outbox TO authenticated;
GRANT ALL ON public.rent_manager_outbox TO service_role;
ALTER TABLE public.rent_manager_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY rent_manager_admin_read ON public.rent_manager_outbox FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.is_active AND p.approval_status='approved'));
CREATE INDEX rent_manager_outbox_order ON public.rent_manager_outbox(inspection_id,created_at,id) WHERE status IN ('pending','sending','error');
CREATE OR REPLACE FUNCTION public.rm_enqueue(p_inspection_id uuid,p_event_type text,p_data jsonb DEFAULT '{}',p_photos jsonb DEFAULT '[]') RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE i public.inspections; r public.inspection_external_references; eid text := 'hi_evt_'||gen_random_uuid()::text; result uuid;
BEGIN
 SELECT * INTO i FROM public.inspections WHERE id=p_inspection_id;
 IF i.market IS DISTINCT FROM 'CL' OR i.inspection_type IS DISTINCT FROM 'captacion' THEN RETURN NULL; END IF;
 SELECT * INTO r FROM public.inspection_external_references WHERE inspection_id=i.id AND provider='rent_manager' AND is_active ORDER BY created_at DESC LIMIT 1;
 IF r.id IS NULL OR NULLIF(r.metadata->>'rm_inspection_id','') IS NULL THEN RETURN NULL; END IF;
 INSERT INTO public.rent_manager_outbox(inspection_id,rm_inspection_id,external_object_id,event_id,event_type,payload,photo_objects)
 VALUES(i.id,r.metadata->>'rm_inspection_id',r.external_object_id,eid,p_event_type,jsonb_build_object('source','homie_inspection','event_id',eid,'event_type',p_event_type,'inspection_id',r.metadata->>'rm_inspection_id','external_object_id',r.external_object_id,'status',i.status,'data',p_data,'at',clock_timestamp()),p_photos) RETURNING id INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.rm_enqueue(uuid,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rm_enqueue(uuid,text,jsonb,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.rm_inspection_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.profiles; e public.profiles; ov jsonb; prev jsonb;
BEGIN
 ov:=COALESCE(NEW.property_snapshot_json,'{}')||COALESCE(NEW.property_overrides_json,'{}');
 prev:=COALESCE(OLD.property_snapshot_json,'{}')||COALESCE(OLD.property_overrides_json,'{}');
 IF (NEW.inspector_id,NEW.executive_id) IS DISTINCT FROM (OLD.inspector_id,OLD.executive_id) AND NEW.inspector_id IS NOT NULL AND NEW.executive_id IS NOT NULL THEN
 SELECT * INTO a FROM public.profiles WHERE id=NEW.inspector_id; SELECT * INTO e FROM public.profiles WHERE id=NEW.executive_id;
 PERFORM public.rm_enqueue(NEW.id,'inspection.created',jsonb_build_object('inspector_email',a.email,'inspector_name',a.full_name,'executive_email',e.email,'executive_name',e.full_name));
 END IF;
 IF ov->>'keys_status' IS DISTINCT FROM prev->>'keys_status' AND ov->>'keys_status' IS NOT NULL THEN
 PERFORM public.rm_enqueue(NEW.id,'inspection.keys_updated',jsonb_strip_nulls(jsonb_build_object('tenencia',CASE WHEN ov->>'keys_status'='administracion' THEN 'administracion_edificio' ELSE ov->>'keys_status' END,'detalle',ov->>'keys_detail')));
 END IF;
 IF NEW.owner_feedback_status IS DISTINCT FROM OLD.owner_feedback_status THEN PERFORM public.rm_enqueue(NEW.id,'inspection.owner_feedback',jsonb_build_object('owner_feedback_status',NEW.owner_feedback_status)); END IF;
 IF NEW.status IS DISTINCT FROM OLD.status THEN
 IF NEW.status='sent' THEN PERFORM public.rm_enqueue(NEW.id,'inspection.finalized',jsonb_build_object('quien_repara',NEW.quien_repara));
 ELSIF NEW.status='submitted' THEN PERFORM public.rm_enqueue(NEW.id,'inspection.submitted',jsonb_build_object('fecha_de_recepcion',COALESCE(ov->>'fecha_de_recepcion',ov->>'fecha_recepcion',to_char(COALESCE(NEW.inspection_completed_at,NEW.completed_at,now()) AT TIME ZONE 'America/Santiago','YYYY-MM-DD'))));
 ELSIF NEW.status NOT IN ('published','assigned') THEN PERFORM public.rm_enqueue(NEW.id,'inspection.status_changed'); END IF;
 ELSIF NEW.quien_repara IS DISTINCT FROM OLD.quien_repara THEN PERFORM public.rm_enqueue(NEW.id,'inspection.status_changed');
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER rm_inspections_enqueue AFTER UPDATE ON public.inspections FOR EACH ROW EXECUTE FUNCTION public.rm_inspection_changed();
CREATE OR REPLACE FUNCTION public.rm_work_order_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c text;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.status,NEW.contractor_id,NEW.keys_status,NEW.keys_lock_number) IS NOT DISTINCT FROM (OLD.status,OLD.contractor_id,OLD.keys_status,OLD.keys_lock_number) THEN RETURN NEW; END IF;
 SELECT name INTO c FROM public.contractors WHERE id=NEW.contractor_id;
 PERFORM public.rm_enqueue(NEW.inspection_id,'inspection.work_order_updated',jsonb_strip_nulls(jsonb_build_object('estado',CASE WHEN NEW.status='approved' THEN 'terminada' ELSE NEW.status END,'contratista',c,'keys_location',CASE WHEN NEW.keys_status='administracion' THEN 'administracion_edificio' ELSE NEW.keys_status END,'lockbox_number',NEW.keys_lock_number)));
 RETURN NEW;
END $$;
CREATE TRIGGER rm_work_orders_enqueue AFTER INSERT OR UPDATE ON public.inspection_work_orders FOR EACH ROW EXECUTE FUNCTION public.rm_work_order_changed();
CREATE OR REPLACE FUNCTION public.rm_final_photos_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE iid uuid; objects jsonb;
BEGIN
 iid:=CASE WHEN TG_OP='DELETE' THEN OLD.inspection_id ELSE NEW.inspection_id END;
 IF TG_OP='DELETE' THEN IF OLD.photo_stage IS DISTINCT FROM 'after' THEN RETURN OLD; END IF;
 ELSE IF NEW.photo_stage IS DISTINCT FROM 'after' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND (NEW.storage_path,NEW.photo_stage) IS NOT DISTINCT FROM (OLD.storage_path,OLD.photo_stage) THEN RETURN NEW; END IF; END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('bucket',p.storage_bucket,'path',p.storage_path) ORDER BY p.sort_order,p.created_at),'[]') INTO objects FROM public.inspection_photos p WHERE p.inspection_id=iid AND p.photo_stage='after';
 PERFORM public.rm_enqueue(iid,'inspection.final_photos_ready',jsonb_build_object('fotos','[]'::jsonb),objects);
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER rm_photos_enqueue AFTER INSERT OR UPDATE OR DELETE ON public.inspection_photos FOR EACH ROW EXECUTE FUNCTION public.rm_final_photos_changed();
CREATE OR REPLACE FUNCTION public.rm_report_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE client numeric; cost numeric; d public.inspection_quotation_discounts;
BEGIN
 IF NEW.status <> 'published' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND (NEW.status,NEW.public_token) IS NOT DISTINCT FROM (OLD.status,OLD.public_token) THEN RETURN NEW; END IF;
 SELECT COALESCE(sum(unit_price*quantity),0),COALESCE(sum(contractor_unit_price*quantity),0) INTO client,cost FROM public.inspection_repair_items WHERE inspection_id=NEW.inspection_id AND NOT is_pending_quote AND NOT is_archived;
 SELECT * INTO d FROM public.inspection_quotation_discounts WHERE inspection_id=NEW.inspection_id AND is_active LIMIT 1;
 IF d.id IS NOT NULL THEN client:=greatest(0,client-CASE WHEN d.discount_type='percentage' THEN client*d.discount_value/100 ELSE d.discount_value END); END IF;
 PERFORM public.rm_enqueue(NEW.inspection_id,'inspection.report_published',jsonb_build_object('report_url',NULL,'owner_url',NULL,'quotation',jsonb_build_object('client_amount',round(client),'contractor_cost',round(cost),'currency','CLP')));
 RETURN NEW;
END $$;
CREATE TRIGGER rm_reports_enqueue AFTER INSERT OR UPDATE ON public.inspection_report_versions FOR EACH ROW EXECUTE FUNCTION public.rm_report_changed();
CREATE OR REPLACE FUNCTION public.rm_claim_outbox(p_limit integer DEFAULT 20) RETURNS SETOF public.rent_manager_outbox LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE public.rent_manager_outbox SET status='pending',next_attempt_at=now(),sending_at=NULL,claim_id=NULL WHERE status='sending' AND sending_at<now()-interval '5 minutes';
 RETURN QUERY WITH heads AS (
 SELECT q.id FROM public.rent_manager_outbox q WHERE q.status IN ('pending','error') AND q.next_attempt_at<=now()
 AND NOT EXISTS(SELECT 1 FROM public.rent_manager_outbox h WHERE h.inspection_id=q.inspection_id AND h.status IN ('pending','sending','error') AND (h.created_at,h.id)<(q.created_at,q.id))
 ORDER BY q.created_at,q.id LIMIT least(greatest(p_limit,1),100) FOR UPDATE SKIP LOCKED
 ) UPDATE public.rent_manager_outbox q SET status='sending',attempts=attempts+1,sending_at=now(),claim_id=gen_random_uuid() FROM heads WHERE heads.id=q.id RETURNING q.*;
END $$;
REVOKE ALL ON FUNCTION public.rm_claim_outbox(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rm_claim_outbox(integer) TO service_role;
CREATE OR REPLACE FUNCTION public.rm_retry_outbox(p_id uuid DEFAULT NULL,p_stalled boolean DEFAULT false) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active AND approval_status='approved') THEN RAISE EXCEPTION 'admin_required'; END IF;
 UPDATE public.rent_manager_outbox SET status='pending',next_attempt_at=now(),last_error=NULL,claim_id=NULL,sending_at=NULL
 WHERE (p_id IS NOT NULL AND id=p_id AND status IN ('error','skipped')) OR (p_stalled AND status='sending' AND sending_at<now()-interval '5 minutes');
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.rm_retry_outbox(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rm_retry_outbox(uuid,boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.rm_inspection_changed(), public.rm_work_order_changed(),public.rm_final_photos_changed(),public.rm_report_changed() FROM PUBLIC,anon,authenticated;
