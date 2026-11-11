CREATE OR REPLACE FUNCTION public.rm_simulate_step(p_id uuid, p_step text, p_params jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE i public.inspections; actor public.profiles; today date:=(now() AT TIME ZONE 'America/Santiago')::date; sec uuid; path text; n int:=0; before_count int; label text; insp uuid; ex uuid; v int;
BEGIN
 SELECT * INTO actor FROM public.profiles WHERE id=auth.uid();
 IF actor.id IS NULL OR NOT actor.is_active OR actor.approval_status<>'approved' OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'simulator_admin_required'; END IF;
 SELECT * INTO i FROM public.inspections WHERE id=p_id FOR UPDATE;
 IF i.id IS NULL OR NOT i.is_test OR NOT EXISTS(SELECT 1 FROM public.inspection_external_references WHERE inspection_id=i.id AND provider='rent_manager' AND is_active) THEN RAISE EXCEPTION 'simulator_test_rent_manager_only'; END IF;
 SELECT count(*) INTO before_count FROM public.rent_manager_outbox WHERE inspection_id=p_id;
 IF p_step='assign' THEN
  insp:=COALESCE(NULLIF(p_params->>'inspector_id','')::uuid,auth.uid()); ex:=COALESCE(NULLIF(p_params->>'executive_id','')::uuid,auth.uid());
  UPDATE public.inspections SET inspector_id=NULL,executive_id=NULL WHERE id=p_id;
  UPDATE public.inspections SET inspector_id=insp,executive_id=ex,status='assigned' WHERE id=p_id; label:='Asignar';
 ELSIF p_step='keys' THEN
  UPDATE public.inspections SET property_overrides_json=COALESCE(property_overrides_json,'{}')-'fecha_recoleccion_llaves' WHERE id=p_id;
  UPDATE public.inspections SET property_overrides_json=COALESCE(property_overrides_json,'{}')||jsonb_build_object('fecha_recoleccion_llaves',to_char(today,'YYYY-MM-DD')) WHERE id=p_id; label:='Programar llaves';
 ELSIF p_step IN ('visit','final') THEN
  IF p_step='visit' THEN SELECT id INTO sec FROM public.inspection_sections WHERE inspection_id=p_id AND section_key='marketing_photos';
  ELSE SELECT id INTO sec FROM public.inspection_sections WHERE inspection_id=p_id ORDER BY sort_order LIMIT 1; END IF;
  IF sec IS NULL THEN RAISE EXCEPTION 'simulator_section_missing'; END IF;
  IF p_step='visit' AND COALESCE(p_params->>'availability','') NOT IN ('inmediata','en_5_dias') THEN RAISE EXCEPTION 'invalid_availability'; END IF;
  IF p_step='visit' THEN UPDATE public.inspections SET rm_availability_choice=NULL,rm_visit_date=NULL WHERE id=p_id; END IF;
  FOR path IN SELECT jsonb_array_elements_text(COALESCE(p_params->'paths','[]')) LOOP
   IF path NOT LIKE 'inspections/'||p_id::text||'/%' OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='inspection-photos' AND name=path) THEN RAISE EXCEPTION 'simulator_invalid_photo'; END IF;
   n:=n+1;
   INSERT INTO public.inspection_photos(inspection_id,inspection_section_id,field_key,group_key,photo_stage,storage_bucket,storage_path,uploaded_by,sort_order,visible_to_owner)
   VALUES(p_id,sec,NULL,'photo',CASE WHEN p_step='visit' THEN 'marketing' ELSE 'after' END,'inspection-photos',path,auth.uid(),1000+n,p_step='final');
  END LOOP;
  IF n=0 THEN RAISE EXCEPTION 'simulator_photos_required'; END IF;
  IF p_step='visit' THEN
   UPDATE public.inspection_sections SET status='completed' WHERE id=sec;
   UPDATE public.inspections SET rm_availability_choice=p_params->>'availability',rm_visit_date=today,rm_available_from=today+CASE WHEN p_params->>'availability'='en_5_dias' THEN 5 ELSE 0 END WHERE id=p_id;
   label:='Visita con fotos'; ELSE label:='Fotos finales'; END IF;
 ELSIF p_step='availability' THEN
  PERFORM public.rm_move_availability(p_id,(p_params->>'date')::date,'Simulado por '||actor.full_name); label:='Cambiar disponibilidad';
 ELSIF p_step='submit' THEN
  UPDATE public.inspections SET status='in_progress' WHERE id=p_id AND status='submitted';
  UPDATE public.inspections SET property_overrides_json=COALESCE(property_overrides_json,'{}')||jsonb_build_object('fecha_de_recepcion',to_char(today,'YYYY-MM-DD')),status='submitted',inspection_completed_at=now(),submitted_by=auth.uid() WHERE id=p_id; label:='Enviar inspección';
 ELSIF p_step='publish' THEN
  SELECT COALESCE(max(version_number),0)+1 INTO v FROM public.inspection_report_versions WHERE inspection_id=p_id;
  UPDATE public.inspection_report_versions SET is_latest=false WHERE inspection_id=p_id AND audience='owner';
  INSERT INTO public.inspection_report_versions(inspection_id,version_number,status,normalized_payload,public_token,is_latest,audience,published_by)
  VALUES(p_id,v,'published',jsonb_build_object('simulated',true,'publicable',COALESCE((p_params->>'publicable')::boolean,true)),encode(extensions.gen_random_bytes(16),'hex'),true,'owner',auth.uid());
  label:='Publicar reporte';
 ELSE RAISE EXCEPTION 'simulator_unknown_step'; END IF;
 INSERT INTO public.inspection_audit_log(inspection_id,previous_status,new_status,action,performed_by,note)
 VALUES(p_id,i.status,(SELECT status FROM public.inspections WHERE id=p_id),'rm_simulated_step',auth.uid(),'Simulado por '||actor.full_name||': '||label);
 RETURN jsonb_build_object('step',p_step,'events',(SELECT COALESCE(jsonb_agg(event_type ORDER BY created_at),'[]') FROM (SELECT event_type,created_at FROM public.rent_manager_outbox WHERE inspection_id=p_id ORDER BY created_at OFFSET before_count) e));
END $$;
REVOKE ALL ON FUNCTION public.rm_simulate_step(uuid,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rm_simulate_step(uuid,text,jsonb) TO authenticated, service_role;