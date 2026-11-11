ALTER TABLE public.inspections ADD COLUMN rm_availability_choice text CHECK(rm_availability_choice IN ('inmediata','en_5_dias')), ADD COLUMN rm_visit_date date, ADD COLUMN rm_available_from date, ADD COLUMN rm_rescheduled_to uuid REFERENCES public.inspections(id), ADD COLUMN rm_reschedule_reason text;
CREATE TABLE public.rent_manager_availability_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),inspection_id uuid NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,available_from date NOT NULL,previous_date date,reason text,changed_by uuid REFERENCES public.profiles(id),created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.rent_manager_availability_history TO authenticated; GRANT ALL ON public.rent_manager_availability_history TO service_role;
ALTER TABLE public.rent_manager_availability_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY rm_availability_read ON public.rent_manager_availability_history FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.inspections i JOIN public.profiles p ON p.id=auth.uid() WHERE i.id=inspection_id AND p.is_active AND p.approval_status='approved' AND (public.has_role(auth.uid(),'admin') OR i.executive_id=auth.uid() OR i.inspector_id=auth.uid())));
CREATE OR REPLACE FUNCTION public.rm_require_actor(p_id uuid,p_kind text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE i public.inspections; BEGIN
 SELECT * INTO i FROM public.inspections WHERE id=p_id;
 IF i.id IS NULL OR i.market IS DISTINCT FROM 'CL' OR i.inspection_type IS DISTINCT FROM 'captacion' OR NOT EXISTS(SELECT 1 FROM public.inspection_external_references WHERE inspection_id=i.id AND provider='rent_manager' AND is_active) THEN RAISE EXCEPTION 'rent_manager_captacion_required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active AND approval_status='approved') OR NOT(public.has_role(auth.uid(),'admin') OR (p_kind='inspector' AND i.inspector_id=auth.uid() AND public.has_role(auth.uid(),'inspector')) OR (p_kind='executive' AND i.executive_id=auth.uid() AND public.has_role(auth.uid(),'executive'))) THEN RAISE EXCEPTION 'assigned_actor_required'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.rm_commercial_ready(p_inspection_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE i public.inspections; photos jsonb; prior jsonb; BEGIN
 SELECT * INTO i FROM public.inspections WHERE id=p_inspection_id;
 IF i.rm_availability_choice IS NULL OR i.rm_visit_date IS NULL OR i.rm_rescheduled_to IS NOT NULL THEN RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.inspection_sections WHERE inspection_id=i.id AND section_key='marketing_photos' AND status='completed') THEN RETURN; END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('bucket',p.storage_bucket,'path',p.storage_path) ORDER BY p.sort_order,p.id),'[]') INTO photos FROM public.inspection_photos p LEFT JOIN public.inspection_sections s ON s.id=p.inspection_section_id WHERE p.inspection_id=i.id AND (p.photo_stage='marketing' OR s.section_key='marketing_photos');
 IF jsonb_array_length(photos)<10 THEN RETURN; END IF;
 SELECT photo_objects INTO prior FROM public.rent_manager_outbox WHERE inspection_id=i.id AND event_type='inspection.commercial_photos_ready' AND payload#>>'{data,disponibilidad}'=i.rm_availability_choice AND payload#>>'{data,fecha_visita}'=i.rm_visit_date::text ORDER BY created_at DESC LIMIT 1;
 IF prior=photos THEN RETURN; END IF;
 PERFORM public.rm_enqueue(i.id,'inspection.commercial_photos_ready',jsonb_build_object('fotos','[]'::jsonb,'disponibilidad',i.rm_availability_choice,'fecha_visita',i.rm_visit_date),photos);
END $$;
CREATE OR REPLACE FUNCTION public.rm_save_visit_availability(p_id uuid,p_choice text,p_visit_date date) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE i public.inspections; BEGIN
 PERFORM public.rm_require_actor(p_id,'inspector'); SELECT * INTO i FROM public.inspections WHERE id=p_id FOR UPDATE;
 IF i.status IN ('submitted','in_review','approved','published','sent') THEN RAISE EXCEPTION 'inspection_read_only'; END IF;
 IF p_choice IS NULL OR p_choice NOT IN ('inmediata','en_5_dias') OR p_visit_date IS NULL OR p_visit_date>(now() AT TIME ZONE 'America/Santiago')::date THEN RAISE EXCEPTION 'invalid_availability'; END IF;
 UPDATE public.inspections SET rm_availability_choice=p_choice,rm_visit_date=COALESCE(rm_visit_date,p_visit_date),rm_available_from=COALESCE(rm_visit_date,p_visit_date)+CASE WHEN p_choice='en_5_dias' THEN 5 ELSE 0 END WHERE id=p_id;
 PERFORM public.rm_commercial_ready(p_id);
END $$;
CREATE OR REPLACE FUNCTION public.rm_move_availability(p_id uuid,p_date date,p_reason text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE prev date; BEGIN
 PERFORM public.rm_require_actor(p_id,'executive');
 IF p_date IS NULL OR p_date<(now() AT TIME ZONE 'America/Santiago')::date OR length(COALESCE(p_reason,''))>2000 THEN RAISE EXCEPTION 'invalid_availability'; END IF;
 SELECT rm_available_from INTO prev FROM public.inspections WHERE id=p_id FOR UPDATE;
 IF prev IS NOT DISTINCT FROM p_date THEN RETURN; END IF;
 UPDATE public.inspections SET rm_available_from=p_date WHERE id=p_id;
 INSERT INTO public.rent_manager_availability_history(inspection_id,available_from,previous_date,reason,changed_by) VALUES(p_id,p_date,prev,NULLIF(trim(p_reason),''),auth.uid());
 PERFORM public.rm_enqueue(p_id,'inspection.availability_updated',jsonb_strip_nulls(jsonb_build_object('disponible_desde',p_date,'motivo',NULLIF(trim(p_reason),''))));
END $$;
CREATE OR REPLACE FUNCTION public.rm_reschedule_inspection(p_id uuid,p_date date,p_reason text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE i public.inspections; r public.inspection_external_references; nid uuid; s public.inspection_sections; sid uuid; BEGIN
 PERFORM public.rm_require_actor(p_id,'inspector'); SELECT * INTO i FROM public.inspections WHERE id=p_id FOR UPDATE;
 IF i.rm_rescheduled_to IS NOT NULL THEN RETURN i.rm_rescheduled_to; END IF;
 IF i.status IN ('submitted','in_review','approved','published','sent') THEN RAISE EXCEPTION 'inspection_read_only'; END IF;
 IF p_date IS NULL OR p_date<=(now() AT TIME ZONE 'America/Santiago')::date OR NULLIF(trim(p_reason),'') IS NULL OR length(p_reason)>2000 THEN RAISE EXCEPTION 'new_date_and_reason_required'; END IF;
 SELECT * INTO r FROM public.inspection_external_references WHERE inspection_id=i.id AND provider='rent_manager' AND is_active ORDER BY created_at DESC LIMIT 1;
 INSERT INTO public.inspections(template_id,property_id,market,property_name,address,property_type,inspection_type,inspector_id,executive_id,status,scheduled_at,property_snapshot_json,property_overrides_json,generated_structure_json,created_by)
 VALUES(i.template_id,i.property_id,i.market,i.property_name,i.address,i.property_type,i.inspection_type,i.inspector_id,i.executive_id,CASE WHEN i.inspector_id IS NOT NULL AND i.executive_id IS NOT NULL THEN 'assigned' ELSE 'pending_assignment' END,p_date::timestamp AT TIME ZONE 'America/Santiago',i.property_snapshot_json-ARRAY['disponibilidad','fecha_visita','fecha_recoleccion_llaves','hora_recoleccion_llaves','fecha_de_recepcion','fecha_recepcion'],COALESCE(i.property_overrides_json,'{}')-ARRAY['disponibilidad','fecha_visita','fecha_recoleccion_llaves','hora_recoleccion_llaves','fecha_de_recepcion','fecha_recepcion'],i.generated_structure_json,auth.uid()) RETURNING id INTO nid;
 INSERT INTO public.inspection_external_references(inspection_id,provider,external_object_type,external_object_id,metadata,is_active) VALUES(nid,'rent_manager',r.external_object_type,r.external_object_id,COALESCE(r.metadata,'{}')||jsonb_build_object('rm_inspection_id',nid::text,'previous_hi_inspection_id',i.id),true);
 FOR s IN SELECT * FROM public.inspection_sections WHERE inspection_id=i.id ORDER BY sort_order LOOP
 INSERT INTO public.inspection_sections(inspection_id,template_section_id,section_key,section_title,section_type,sort_order,is_visible) VALUES(nid,s.template_section_id,s.section_key,s.section_title,s.section_type,s.sort_order,s.is_visible) RETURNING id INTO sid;
 INSERT INTO public.inspection_field_values(inspection_id,inspection_section_id,field_key,field_label,field_type,group_key,sort_order,is_visible,value_json) SELECT nid,sid,field_key,field_label,field_type,group_key,sort_order,is_visible,value_json FROM public.inspection_field_values WHERE inspection_section_id=s.id;
 END LOOP;
 UPDATE public.inspections SET status='sent',completed_at=now(),rm_rescheduled_to=nid,rm_reschedule_reason=trim(p_reason) WHERE id=i.id;
 PERFORM public.rm_enqueue(i.id,'inspection.rescheduled',jsonb_build_object('nueva_fecha',p_date,'nuevo_id',nid,'motivo',trim(p_reason)));
 RETURN nid;
END $$;
CREATE OR REPLACE FUNCTION public.rm_visit_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE ov jsonb; prev jsonb; BEGIN
 ov:=COALESCE(NEW.property_snapshot_json,'{}')||COALESCE(NEW.property_overrides_json,'{}'); prev:=COALESCE(OLD.property_snapshot_json,'{}')||COALESCE(OLD.property_overrides_json,'{}');
 IF NULLIF(ov->>'fecha_recoleccion_llaves','') IS NOT NULL AND ov->>'fecha_recoleccion_llaves' IS DISTINCT FROM prev->>'fecha_recoleccion_llaves' THEN PERFORM public.rm_enqueue(NEW.id,'inspection.keys_collection_scheduled',jsonb_build_object('fecha_de_recoleccion_de_llaves',ov->>'fecha_recoleccion_llaves')); END IF;
 IF (NEW.rm_availability_choice,NEW.rm_visit_date) IS DISTINCT FROM (OLD.rm_availability_choice,OLD.rm_visit_date) THEN PERFORM public.rm_commercial_ready(NEW.id); END IF;
 RETURN NEW; END $$;
CREATE TRIGGER rm_visit_changed AFTER UPDATE ON public.inspections FOR EACH ROW EXECUTE FUNCTION public.rm_visit_changed();
REVOKE ALL ON FUNCTION public.rm_require_actor(uuid,text),public.rm_visit_changed(),public.rm_save_visit_availability(uuid,text,date),public.rm_move_availability(uuid,date,text),public.rm_reschedule_inspection(uuid,date,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.rm_require_actor(uuid,text),public.rm_visit_changed() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rm_save_visit_availability(uuid,text,date),public.rm_move_availability(uuid,date,text),public.rm_reschedule_inspection(uuid,date,text) TO authenticated;