CREATE OR REPLACE FUNCTION public.publish_quotation_version(p_inspection_id uuid, p_payload jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_i public.inspections%ROWTYPE; v_n integer; v_owner text; v_tenant text; v_name text; v_payload jsonb; v_time timestamptz := now(); v_mx boolean;
BEGIN
 IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'executive')) THEN RAISE EXCEPTION 'not_authorized'; END IF;
 SELECT * INTO v_i FROM public.inspections WHERE id=p_inspection_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'inspection_not_found'; END IF;
 IF NOT public.has_role(auth.uid(),'admin') AND v_i.executive_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'not_authorized'; END IF;
 IF v_i.inspection_type NOT IN ('check_out','captacion') THEN RAISE EXCEPTION 'invalid_inspection_type'; END IF;
 IF jsonb_typeof(p_payload->'sections') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid_snapshot'; END IF;
 v_mx := v_i.inspection_type='captacion' AND upper(coalesce(v_i.market,'')) LIKE 'MX%';
 SELECT COALESCE(max(version_number),0)+1 INTO v_n FROM public.inspection_report_versions WHERE inspection_id=p_inspection_id;
 SELECT public_token INTO v_owner FROM public.inspection_report_versions WHERE inspection_id=p_inspection_id AND audience='owner' ORDER BY version_number DESC LIMIT 1;
 SELECT public_token INTO v_tenant FROM public.inspection_report_versions WHERE inspection_id=p_inspection_id AND audience='tenant' ORDER BY version_number DESC LIMIT 1;
 v_owner := COALESCE(v_owner, gen_random_uuid()::text); v_tenant := COALESCE(v_tenant, gen_random_uuid()::text);
 SELECT full_name INTO v_name FROM public.profiles WHERE id=auth.uid();
 v_payload := p_payload || jsonb_build_object('quotation_schema_version',1,'version_number',v_n,'published_at',v_time,'published_by_name',v_name,'homie_approved',v_mx);
 UPDATE public.inspection_report_versions SET is_latest=false WHERE inspection_id=p_inspection_id AND is_latest;
 INSERT INTO public.inspection_report_versions(inspection_id,version_number,status,audience,public_token,normalized_payload,is_latest,published_by,created_at) VALUES
 (p_inspection_id,v_n,'published','owner',v_owner,v_payload,true,auth.uid(),v_time),
 (p_inspection_id,v_n,'published','tenant',v_tenant,v_payload,true,auth.uid(),v_time);
 UPDATE public.inspections SET status='published', current_stage='share', published_at=v_time, owner_url_generated_at=v_time, approved_at=v_time, approved_by=auth.uid(),
   owner_feedback_status = CASE WHEN v_mx THEN 'accepted' ELSE 'none' END WHERE id=p_inspection_id;
 INSERT INTO public.inspection_audit_log(inspection_id,action,performed_by,note) VALUES (p_inspection_id,'quotation_published',auth.uid(),'v'||v_n::text||CASE WHEN v_mx THEN ' · aprobado por Homie (MX)' ELSE '' END);
 RETURN jsonb_build_object('version_number',v_n,'owner_token',v_owner,'tenant_token',v_tenant);
END $function$;