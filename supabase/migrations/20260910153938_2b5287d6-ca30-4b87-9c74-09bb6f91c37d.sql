-- 1. Allow the new role
ALTER TABLE public.profiles DROP CONSTRAINT profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['admin','inspector','property_advisor','executive','comercial','contractor','pending']));

-- 2. Helper: which inspection types the current receiver role may touch
CREATE OR REPLACE FUNCTION public.receiver_type_allowed(_inspection_type text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE public.get_user_role(auth.uid())
    WHEN 'property_advisor' THEN _inspection_type = 'check_in'
    WHEN 'inspector' THEN _inspection_type IS DISTINCT FROM 'check_in'
    ELSE true
  END
$$;

-- 3. Rebuild receiver policies with the type restriction
DROP POLICY "Inspectors can view assigned inspections" ON public.inspections;
CREATE POLICY "Inspectors can view assigned inspections" ON public.inspections
FOR SELECT USING (inspector_id = (SELECT auth.uid()) AND public.receiver_type_allowed(inspection_type));

DROP POLICY "Inspectors can update assigned inspections" ON public.inspections;
CREATE POLICY "Inspectors can update assigned inspections" ON public.inspections
FOR UPDATE USING (inspector_id = (SELECT auth.uid()) AND public.receiver_type_allowed(inspection_type));

DROP POLICY "Inspectors can view sections of assigned inspections" ON public.inspection_sections;
CREATE POLICY "Inspectors can view sections of assigned inspections" ON public.inspection_sections
FOR SELECT USING (EXISTS (SELECT 1 FROM public.inspections i WHERE i.id = inspection_sections.inspection_id AND i.inspector_id = (SELECT auth.uid()) AND public.receiver_type_allowed(i.inspection_type)));

DROP POLICY "Inspectors can update sections of assigned inspections" ON public.inspection_sections;
CREATE POLICY "Inspectors can update sections of assigned inspections" ON public.inspection_sections
FOR UPDATE USING (EXISTS (SELECT 1 FROM public.inspections i WHERE i.id = inspection_sections.inspection_id AND i.inspector_id = (SELECT auth.uid()) AND public.receiver_type_allowed(i.inspection_type)));

DROP POLICY "Inspectors can view field values of assigned inspections" ON public.inspection_field_values;
CREATE POLICY "Inspectors can view field values of assigned inspections" ON public.inspection_field_values
FOR SELECT USING (EXISTS (SELECT 1 FROM public.inspections i WHERE i.id = inspection_field_values.inspection_id AND i.inspector_id = (SELECT auth.uid()) AND public.receiver_type_allowed(i.inspection_type)));

DROP POLICY "Inspectors can update field values of assigned inspections" ON public.inspection_field_values;
CREATE POLICY "Inspectors can update field values of assigned inspections" ON public.inspection_field_values
FOR UPDATE USING (EXISTS (SELECT 1 FROM public.inspections i WHERE i.id = inspection_field_values.inspection_id AND i.inspector_id = (SELECT auth.uid()) AND public.receiver_type_allowed(i.inspection_type)));

DROP POLICY "Inspectors can upsert field values of assigned inspections" ON public.inspection_field_values;
CREATE POLICY "Inspectors can upsert field values of assigned inspections" ON public.inspection_field_values
FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.inspections i WHERE i.id = inspection_field_values.inspection_id AND i.inspector_id = (SELECT auth.uid()) AND public.receiver_type_allowed(i.inspection_type)));

DROP POLICY "Inspectors can view photos of assigned inspections" ON public.inspection_photos;
CREATE POLICY "Inspectors can view photos of assigned inspections" ON public.inspection_photos
FOR SELECT USING (EXISTS (SELECT 1 FROM public.inspections i WHERE i.id = inspection_photos.inspection_id AND i.inspector_id = (SELECT auth.uid()) AND public.receiver_type_allowed(i.inspection_type)));

DROP POLICY "Inspectors can insert photos for assigned inspections" ON public.inspection_photos;
CREATE POLICY "Inspectors can insert photos for assigned inspections" ON public.inspection_photos
FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.inspections i WHERE i.id = inspection_photos.inspection_id AND i.inspector_id = (SELECT auth.uid()) AND public.receiver_type_allowed(i.inspection_type)));

DROP POLICY "Inspectors can delete photos from assigned inspections" ON public.inspection_photos;
CREATE POLICY "Inspectors can delete photos from assigned inspections" ON public.inspection_photos
FOR DELETE USING (EXISTS (SELECT 1 FROM public.inspections i WHERE i.id = inspection_photos.inspection_id AND i.inspector_id = (SELECT auth.uid()) AND public.receiver_type_allowed(i.inspection_type)));

DROP POLICY "Inspectors can view reviews of assigned inspections" ON public.inspection_reviews;
CREATE POLICY "Inspectors can view reviews of assigned inspections" ON public.inspection_reviews
FOR SELECT USING (EXISTS (SELECT 1 FROM public.inspections i WHERE i.id = inspection_reviews.inspection_id AND i.inspector_id = (SELECT auth.uid()) AND public.receiver_type_allowed(i.inspection_type)));

DROP POLICY "Inspectors can select signatures for assigned inspections" ON public.inspection_signatures;
CREATE POLICY "Inspectors can select signatures for assigned inspections" ON public.inspection_signatures
FOR SELECT USING (EXISTS (SELECT 1 FROM public.inspections i WHERE i.id = inspection_signatures.inspection_id AND i.inspector_id = (SELECT auth.uid()) AND public.receiver_type_allowed(i.inspection_type)));

DROP POLICY "Inspectors can insert signatures for assigned inspections" ON public.inspection_signatures;
CREATE POLICY "Inspectors can insert signatures for assigned inspections" ON public.inspection_signatures
FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.inspections i WHERE i.id = inspection_signatures.inspection_id AND i.inspector_id = (SELECT auth.uid()) AND public.receiver_type_allowed(i.inspection_type)));

DROP POLICY "Inspectors can delete signatures for assigned inspections" ON public.inspection_signatures;
CREATE POLICY "Inspectors can delete signatures for assigned inspections" ON public.inspection_signatures
FOR DELETE USING (EXISTS (SELECT 1 FROM public.inspections i WHERE i.id = inspection_signatures.inspection_id AND i.inspector_id = (SELECT auth.uid()) AND public.receiver_type_allowed(i.inspection_type)));

-- 4. Staff visibility must include the new role
DROP POLICY "Executives can view staff profiles" ON public.profiles;
CREATE POLICY "Executives can view staff profiles" ON public.profiles
FOR SELECT USING (public.has_role(auth.uid(), 'executive') AND role = ANY (ARRAY['inspector','property_advisor','executive','admin']));

DROP POLICY "Comercial can view basic profiles" ON public.profiles;
CREATE POLICY "Comercial can view basic profiles" ON public.profiles
FOR SELECT USING ((SELECT public.is_comercial()) AND role = ANY (ARRAY['inspector','property_advisor','executive','admin','comercial']));

-- 5. Performance reports: inspectors exclude check-in, advisors only check-in
CREATE OR REPLACE FUNCTION public.get_inspector_performance(p_market text DEFAULT NULL::text)
 RETURNS TABLE(inspector_id uuid, inspector_name text, assigned integer, completed integer, in_progress integer, photos integer, photos_per_inspection numeric, fields_filled integer, avg_active_minutes numeric, median_active_minutes numeric, median_hours_to_submit numeric, last_activity_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH guard AS (
    SELECT CASE WHEN public.has_role(auth.uid(), 'admin') THEN true ELSE (SELECT true WHERE false) END AS ok
  ),
  insp AS (
    SELECT p.id AS insp_uid, COALESCE(p.full_name, p.email) AS name FROM public.profiles p WHERE p.role = 'inspector'
  ),
  ins AS (
    SELECT i.* FROM public.inspections i
    WHERE i.inspector_id IS NOT NULL
      AND i.inspection_type IS DISTINCT FROM 'check_in'
      AND (p_market IS NULL OR upper(trim(i.market)) = upper(trim(p_market)))
  ),
  counts AS (
    SELECT inspector_id, count(*)::int AS assigned,
      count(*) FILTER (WHERE completed_at IS NOT NULL)::int AS completed,
      count(*) FILTER (WHERE status = 'in_progress')::int AS in_progress
    FROM ins GROUP BY inspector_id
  ),
  ph AS (
    SELECT i.inspector_id, ph.inspection_id, ph.created_at,
      ph.created_at - lag(ph.created_at) OVER (PARTITION BY ph.inspection_id ORDER BY ph.created_at) AS gap
    FROM public.inspection_photos ph JOIN ins i ON i.id = ph.inspection_id
  ),
  active AS (
    SELECT inspector_id, inspection_id,
      sum(EXTRACT(EPOCH FROM gap) / 60) FILTER (WHERE gap <= interval '30 minutes') AS active_minutes,
      count(*)::int AS photo_count, max(created_at) AS last_photo_at
    FROM ph GROUP BY inspector_id, inspection_id
  ),
  photo_agg AS (
    SELECT inspector_id, sum(photo_count)::int AS photos,
      round(avg(photo_count)::numeric, 1) AS photos_per_inspection,
      round(avg(active_minutes)::numeric, 0) AS avg_active_minutes,
      round(percentile_cont(0.5) WITHIN GROUP (ORDER BY active_minutes)::numeric, 0) AS median_active_minutes,
      max(last_photo_at) AS last_photo_at
    FROM active GROUP BY inspector_id
  ),
  submit AS (
    SELECT a.inspector_id,
      round(percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (i.completed_at - a.last_photo_at)) / 3600)::numeric, 1) AS median_hours_to_submit
    FROM active a JOIN ins i ON i.id = a.inspection_id
    WHERE i.completed_at IS NOT NULL AND i.completed_at > a.last_photo_at
    GROUP BY a.inspector_id
  ),
  fields AS (
    SELECT i.inspector_id, count(*)::int AS fields_filled, max(fv.updated_at) AS last_field_at
    FROM public.inspection_field_values fv JOIN ins i ON i.id = fv.inspection_id
    WHERE fv.value_json IS NOT NULL GROUP BY i.inspector_id
  )
  SELECT e.insp_uid, e.name, COALESCE(c.assigned, 0), COALESCE(c.completed, 0), COALESCE(c.in_progress, 0),
    COALESCE(pa.photos, 0), pa.photos_per_inspection, COALESCE(f.fields_filled, 0),
    pa.avg_active_minutes, pa.median_active_minutes, s.median_hours_to_submit,
    GREATEST(pa.last_photo_at, f.last_field_at)
  FROM insp e
  CROSS JOIN guard g
  LEFT JOIN counts c ON c.inspector_id = e.insp_uid
  LEFT JOIN photo_agg pa ON pa.inspector_id = e.insp_uid
  LEFT JOIN submit s ON s.inspector_id = e.insp_uid
  LEFT JOIN fields f ON f.inspector_id = e.insp_uid
  WHERE g.ok
  ORDER BY COALESCE(c.assigned, 0) DESC;
$function$;

CREATE OR REPLACE FUNCTION public.get_advisor_performance(p_market text DEFAULT NULL::text)
 RETURNS TABLE(inspector_id uuid, inspector_name text, assigned integer, completed integer, in_progress integer, photos integer, photos_per_inspection numeric, fields_filled integer, avg_active_minutes numeric, median_active_minutes numeric, median_hours_to_submit numeric, last_activity_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH guard AS (
    SELECT CASE WHEN public.has_role(auth.uid(), 'admin') THEN true ELSE (SELECT true WHERE false) END AS ok
  ),
  insp AS (
    SELECT p.id AS insp_uid, COALESCE(p.full_name, p.email) AS name FROM public.profiles p WHERE p.role = 'property_advisor'
  ),
  ins AS (
    SELECT i.* FROM public.inspections i
    WHERE i.inspector_id IS NOT NULL
      AND i.inspection_type = 'check_in'
      AND (p_market IS NULL OR upper(trim(i.market)) = upper(trim(p_market)))
  ),
  counts AS (
    SELECT inspector_id, count(*)::int AS assigned,
      count(*) FILTER (WHERE completed_at IS NOT NULL)::int AS completed,
      count(*) FILTER (WHERE status = 'in_progress')::int AS in_progress
    FROM ins GROUP BY inspector_id
  ),
  ph AS (
    SELECT i.inspector_id, ph.inspection_id, ph.created_at,
      ph.created_at - lag(ph.created_at) OVER (PARTITION BY ph.inspection_id ORDER BY ph.created_at) AS gap
    FROM public.inspection_photos ph JOIN ins i ON i.id = ph.inspection_id
  ),
  active AS (
    SELECT inspector_id, inspection_id,
      sum(EXTRACT(EPOCH FROM gap) / 60) FILTER (WHERE gap <= interval '30 minutes') AS active_minutes,
      count(*)::int AS photo_count, max(created_at) AS last_photo_at
    FROM ph GROUP BY inspector_id, inspection_id
  ),
  photo_agg AS (
    SELECT inspector_id, sum(photo_count)::int AS photos,
      round(avg(photo_count)::numeric, 1) AS photos_per_inspection,
      round(avg(active_minutes)::numeric, 0) AS avg_active_minutes,
      round(percentile_cont(0.5) WITHIN GROUP (ORDER BY active_minutes)::numeric, 0) AS median_active_minutes,
      max(last_photo_at) AS last_photo_at
    FROM active GROUP BY inspector_id
  ),
  submit AS (
    SELECT a.inspector_id,
      round(percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (i.completed_at - a.last_photo_at)) / 3600)::numeric, 1) AS median_hours_to_submit
    FROM active a JOIN ins i ON i.id = a.inspection_id
    WHERE i.completed_at IS NOT NULL AND i.completed_at > a.last_photo_at
    GROUP BY a.inspector_id
  ),
  fields AS (
    SELECT i.inspector_id, count(*)::int AS fields_filled, max(fv.updated_at) AS last_field_at
    FROM public.inspection_field_values fv JOIN ins i ON i.id = fv.inspection_id
    WHERE fv.value_json IS NOT NULL GROUP BY i.inspector_id
  )
  SELECT e.insp_uid, e.name, COALESCE(c.assigned, 0), COALESCE(c.completed, 0), COALESCE(c.in_progress, 0),
    COALESCE(pa.photos, 0), pa.photos_per_inspection, COALESCE(f.fields_filled, 0),
    pa.avg_active_minutes, pa.median_active_minutes, s.median_hours_to_submit,
    GREATEST(pa.last_photo_at, f.last_field_at)
  FROM insp e
  CROSS JOIN guard g
  LEFT JOIN counts c ON c.inspector_id = e.insp_uid
  LEFT JOIN photo_agg pa ON pa.inspector_id = e.insp_uid
  LEFT JOIN submit s ON s.inspector_id = e.insp_uid
  LEFT JOIN fields f ON f.inspector_id = e.insp_uid
  WHERE g.ok
  ORDER BY COALESCE(c.assigned, 0) DESC;
$function$;