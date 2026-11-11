CREATE OR REPLACE FUNCTION public.rm_commercial_ready(p_inspection_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE i public.inspections; ov jsonb; photos jsonb; readiness text; visit text; prior jsonb;
BEGIN
 SELECT * INTO i FROM public.inspections WHERE id=p_inspection_id;
 ov:=COALESCE(i.property_snapshot_json,'{}')||COALESCE(i.property_overrides_json,'{}');
 readiness:=ov->>'disponibilidad'; visit:=ov->>'fecha_visita';
 IF readiness IS NULL OR readiness NOT IN ('inmediata','en_5_dias') OR visit IS NULL THEN RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.inspection_sections WHERE inspection_id=i.id AND section_key='marketing_photos' AND status='completed') THEN RETURN; END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('bucket',p.storage_bucket,'path',p.storage_path) ORDER BY p.sort_order,p.id),'[]') INTO photos FROM public.inspection_photos p LEFT JOIN public.inspection_sections s ON s.id=p.inspection_section_id WHERE p.inspection_id=i.id AND (p.photo_stage='marketing' OR s.section_key='marketing_photos');
 IF jsonb_array_length(photos)<10 THEN RETURN; END IF;
 SELECT photo_objects INTO prior FROM public.rent_manager_outbox WHERE inspection_id=i.id AND event_type='inspection.commercial_photos_ready' AND payload#>>'{data,disponibilidad}'=readiness AND payload#>>'{data,fecha_visita}'=visit ORDER BY created_at DESC LIMIT 1;
 IF prior=photos THEN RETURN; END IF;
 PERFORM public.rm_enqueue(i.id,'inspection.commercial_photos_ready',jsonb_build_object('fotos','[]'::jsonb,'disponibilidad',readiness,'fecha_visita',visit),photos);
END $$;
CREATE OR REPLACE FUNCTION public.rm_commercial_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_TABLE_NAME='inspections' THEN PERFORM public.rm_commercial_ready(NEW.id);
 ELSE IF TG_OP='DELETE' THEN PERFORM public.rm_commercial_ready(OLD.inspection_id); RETURN OLD; END IF;
 PERFORM public.rm_commercial_ready(NEW.inspection_id); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER rm_commercial_photos_enqueue AFTER INSERT OR UPDATE OR DELETE ON public.inspection_photos FOR EACH ROW EXECUTE FUNCTION public.rm_commercial_changed();
CREATE TRIGGER rm_commercial_section_enqueue AFTER UPDATE OF status ON public.inspection_sections FOR EACH ROW EXECUTE FUNCTION public.rm_commercial_changed();
CREATE TRIGGER rm_commercial_availability_enqueue AFTER UPDATE OF property_overrides_json ON public.inspections FOR EACH ROW EXECUTE FUNCTION public.rm_commercial_changed();
REVOKE ALL ON FUNCTION public.rm_commercial_ready(uuid),public.rm_commercial_changed() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rm_commercial_ready(uuid) TO service_role;
