CREATE TABLE public.user_roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, role text NOT NULL CHECK (role='hunter'), UNIQUE(user_id,role));
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_roles_read ON public.user_roles FOR SELECT TO authenticated USING (user_id=auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE FUNCTION public.is_hunter() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles r JOIN public.profiles p ON p.id=r.user_id WHERE r.user_id=auth.uid() AND r.role='hunter' AND p.is_active AND p.approval_status='approved'); $$;
REVOKE ALL ON FUNCTION public.is_hunter() FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.is_hunter() TO authenticated,service_role;
CREATE FUNCTION public.set_internal_user_role(p_user_id uuid,p_role text,p_approve boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='admin' AND is_active AND approval_status='approved') THEN RAISE EXCEPTION 'forbidden'; END IF;
IF p_role NOT IN ('admin','inspector','property_advisor','executive','comercial','contractor','hunter') THEN RAISE EXCEPTION 'invalid_role'; END IF;
IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user_id) THEN RAISE EXCEPTION 'user_not_found'; END IF;
DELETE FROM public.user_roles WHERE user_id=p_user_id;
UPDATE public.profiles SET role=CASE WHEN p_role='hunter' THEN 'pending' ELSE p_role END, markets=CASE WHEN p_role='hunter' THEN ARRAY['CL','MX'] ELSE markets END, is_active=CASE WHEN p_approve THEN true ELSE is_active END,approval_status=CASE WHEN p_approve THEN 'approved' ELSE approval_status END WHERE id=p_user_id;
IF p_role='hunter' THEN INSERT INTO public.user_roles(user_id,role) VALUES(p_user_id,'hunter'); END IF;
END; $$;
REVOKE ALL ON FUNCTION public.set_internal_user_role(uuid,text,boolean) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.set_internal_user_role(uuid,text,boolean) TO authenticated;
CREATE FUNCTION public.get_hunter_captaciones(p_search text DEFAULT '',p_market text DEFAULT '',p_offset integer DEFAULT 0) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF NOT public.is_hunter() THEN RAISE EXCEPTION 'forbidden'; END IF;
RETURN coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM (SELECT i.id,i.property_id,i.address,i.market,i.created_at,count(p.id) AS photo_count FROM public.inspections i JOIN public.inspection_sections s ON s.inspection_id=i.id AND s.section_key='marketing_photos' JOIN public.inspection_photos p ON p.inspection_id=i.id AND p.inspection_section_id=s.id AND p.photo_stage='marketing' WHERE i.inspection_type='captacion' AND i.market IN ('CL','MX') AND (p_market='' OR i.market=p_market) AND (coalesce(i.address,'') ILIKE '%'||left(p_search,150)||'%' OR i.property_id ILIKE '%'||left(p_search,150)||'%') GROUP BY i.id ORDER BY i.created_at DESC,i.id LIMIT 30 OFFSET greatest(p_offset,0)) q),'[]'::jsonb);
END; $$;
CREATE FUNCTION public.get_hunter_marketing_photos(p_captacion_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF NOT public.is_hunter() THEN RAISE EXCEPTION 'forbidden'; END IF;
RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'inspection_id',i.id,'storage_bucket',p.storage_bucket,'storage_path',p.storage_path,'caption',p.caption,'created_at',p.created_at,'captacion_date',i.created_at) ORDER BY p.sort_order,p.created_at,p.id) FROM public.inspections i JOIN public.inspection_sections s ON s.inspection_id=i.id AND s.section_key='marketing_photos' JOIN public.inspection_photos p ON p.inspection_id=i.id AND p.inspection_section_id=s.id AND p.photo_stage='marketing' WHERE i.id=p_captacion_id AND i.inspection_type='captacion' AND i.market IN ('CL','MX')),'[]'::jsonb);
END; $$;
CREATE FUNCTION public.hunter_can_read_marketing_object(p_bucket text,p_path text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT public.is_hunter() AND p_bucket='inspection-photos' AND EXISTS(SELECT 1 FROM public.inspection_photos p JOIN public.inspections i ON i.id=p.inspection_id JOIN public.inspection_sections s ON s.id=p.inspection_section_id AND s.inspection_id=i.id WHERE i.inspection_type='captacion' AND i.market IN ('CL','MX') AND s.section_key='marketing_photos' AND p.photo_stage='marketing' AND p.storage_bucket=p_bucket AND p.storage_path=p_path); $$;
REVOKE ALL ON FUNCTION public.get_hunter_captaciones(text,text,integer),public.get_hunter_marketing_photos(uuid),public.hunter_can_read_marketing_object(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_hunter_captaciones(text,text,integer),public.get_hunter_marketing_photos(uuid),public.hunter_can_read_marketing_object(text,text) TO authenticated,service_role;
CREATE POLICY hunter_marketing_objects ON storage.objects FOR SELECT TO authenticated USING(public.hunter_can_read_marketing_object(bucket_id,name));