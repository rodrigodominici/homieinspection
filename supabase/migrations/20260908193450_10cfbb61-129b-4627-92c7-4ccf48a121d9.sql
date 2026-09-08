-- 1. profiles.markets
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS markets text[] NOT NULL DEFAULT '{CL}';

-- 2. data cleanup
UPDATE public.inspections SET market = 'CL' WHERE lower(trim(market)) IN ('chile','cl','cli');
UPDATE public.inspections SET market = 'MX' WHERE lower(trim(market)) IN ('mexico','méxico','mx');
UPDATE public.profiles SET market = 'CL' WHERE market IS NULL OR trim(market) = '';
UPDATE public.profiles SET market = 'CL' WHERE lower(trim(market)) = 'chile';
UPDATE public.profiles SET market = 'MX' WHERE lower(trim(market)) IN ('mexico','méxico');
UPDATE public.profiles SET markets = ARRAY[upper(trim(market))]
 WHERE markets IS NULL OR markets = '{}' OR markets = '{CL}';
UPDATE public.repair_catalog_items SET market = 'CL' WHERE market IS NULL OR trim(market) = '';
UPDATE public.repair_catalog_items SET market = upper(trim(market));

-- 3. helpers
CREATE OR REPLACE FUNCTION public.user_markets(_user_id uuid)
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(markets, ARRAY[]::text[]) FROM public.profiles
  WHERE id = _user_id AND is_active = true;
$$;

CREATE OR REPLACE FUNCTION public.user_has_market(_user_id uuid, _market text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _user_id
      AND p.is_active = true
      AND (
        p.role = 'admin'
        OR upper(trim(coalesce(_market, ''))) = ANY (
          SELECT upper(trim(m)) FROM unnest(COALESCE(p.markets, ARRAY[]::text[])) m
        )
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_markets(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_market(uuid, text) TO authenticated;

-- 4. market scoping on inspections reads
DROP POLICY IF EXISTS "market_scope_inspections" ON public.inspections;
CREATE POLICY "market_scope_inspections" ON public.inspections
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.user_has_market(auth.uid(), market));

DROP POLICY IF EXISTS "market_scope_sections" ON public.inspection_sections;
CREATE POLICY "market_scope_sections" ON public.inspection_sections
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.inspections i
                 WHERE i.id = inspection_sections.inspection_id
                   AND public.user_has_market(auth.uid(), i.market)));

DROP POLICY IF EXISTS "market_scope_field_values" ON public.inspection_field_values;
CREATE POLICY "market_scope_field_values" ON public.inspection_field_values
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.inspections i
                 WHERE i.id = inspection_field_values.inspection_id
                   AND public.user_has_market(auth.uid(), i.market)));

DROP POLICY IF EXISTS "market_scope_photos" ON public.inspection_photos;
CREATE POLICY "market_scope_photos" ON public.inspection_photos
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.inspections i
                 WHERE i.id = inspection_photos.inspection_id
                   AND public.user_has_market(auth.uid(), i.market)));

DROP POLICY IF EXISTS "market_scope_repair_items" ON public.inspection_repair_items;
CREATE POLICY "market_scope_repair_items" ON public.inspection_repair_items
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.inspections i
                 WHERE i.id = inspection_repair_items.inspection_id
                   AND public.user_has_market(auth.uid(), i.market)));

-- 5. non-admins cannot change their own markets
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF public.has_role(auth.uid(), 'admin') THEN RETURN NEW; END IF;
  IF NEW.role IS DISTINCT FROM OLD.role THEN RAISE EXCEPTION 'Not allowed to change role'; END IF;
  IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN RAISE EXCEPTION 'Not allowed to change is_active'; END IF;
  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN RAISE EXCEPTION 'Not allowed to change approval_status'; END IF;
  IF NEW.markets IS DISTINCT FROM OLD.markets THEN RAISE EXCEPTION 'Not allowed to change markets'; END IF;
  RETURN NEW;
END;
$$;

-- 6. performance RPCs accept an optional market
CREATE OR REPLACE FUNCTION public.get_executive_performance(p_market text DEFAULT NULL)
 RETURNS TABLE(executive_id uuid, executive_name text, assigned integer, published integer, median_hours_to_review numeric, median_hours_to_publish numeric, report_versions integer, inspections_with_versions integer, versions_per_report numeric, repair_items integer, inspections_with_items integer, items_per_inspection numeric, client_amount numeric, contractor_cost numeric, margin_pct numeric, owner_responded integer, owner_accepted integer, owner_no_response integer, median_days_owner_response numeric)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH guard AS (
    SELECT CASE WHEN public.has_role(auth.uid(), 'admin') THEN true ELSE (SELECT true WHERE false) END AS ok
  ),
  execs AS (
    SELECT p.id, COALESCE(p.full_name, p.email) AS name FROM public.profiles p WHERE p.role = 'executive'
  ),
  insp AS (
    SELECT i.*, e.id AS exec_id
    FROM public.inspections i
    JOIN execs e ON e.id = i.executive_id
    WHERE p_market IS NULL OR upper(trim(i.market)) = upper(trim(p_market))
  ),
  timing AS (
    SELECT exec_id,
      count(*)::int AS assigned,
      count(*) FILTER (WHERE published_at IS NOT NULL)::int AS published,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (review_completed_at - completed_at)) / 3600)
        FILTER (WHERE review_completed_at > completed_at) AS med_h_review,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (published_at - completed_at)) / 3600)
        FILTER (WHERE published_at > completed_at) AS med_h_publish,
      count(*) FILTER (WHERE owner_feedback_last_submitted_at IS NOT NULL)::int AS owner_responded,
      count(*) FILTER (WHERE owner_feedback_status = 'accepted')::int AS owner_accepted,
      count(*) FILTER (WHERE published_at IS NOT NULL AND owner_feedback_last_submitted_at IS NULL)::int AS owner_no_response,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (owner_feedback_last_submitted_at - published_at)) / 86400)
        FILTER (WHERE owner_feedback_last_submitted_at > published_at) AS med_d_owner
    FROM insp GROUP BY exec_id
  ),
  versions AS (
    SELECT i.exec_id, count(*)::int AS versions, count(DISTINCT v.inspection_id)::int AS insp_with_versions
    FROM public.inspection_report_versions v JOIN insp i ON i.id = v.inspection_id GROUP BY i.exec_id
  ),
  budget AS (
    SELECT i.exec_id, count(*)::int AS items, count(DISTINCT r.inspection_id)::int AS insp_with_items,
      COALESCE(sum(r.subtotal), 0)::numeric AS client_amount,
      COALESCE(sum(r.contractor_unit_price * r.quantity), 0)::numeric AS contractor_cost
    FROM public.inspection_repair_items r JOIN insp i ON i.id = r.inspection_id GROUP BY i.exec_id
  )
  SELECT e.id, e.name, COALESCE(t.assigned, 0), COALESCE(t.published, 0),
    round(t.med_h_review::numeric, 1), round(t.med_h_publish::numeric, 1),
    COALESCE(v.versions, 0), COALESCE(v.insp_with_versions, 0),
    CASE WHEN COALESCE(v.insp_with_versions, 0) > 0 THEN round(v.versions::numeric / v.insp_with_versions, 1) END,
    COALESCE(b.items, 0), COALESCE(b.insp_with_items, 0),
    CASE WHEN COALESCE(b.insp_with_items, 0) > 0 THEN round(b.items::numeric / b.insp_with_items, 1) END,
    COALESCE(b.client_amount, 0), COALESCE(b.contractor_cost, 0),
    CASE WHEN COALESCE(b.client_amount, 0) > 0 THEN round(100 * (b.client_amount - b.contractor_cost) / b.client_amount, 1) END,
    COALESCE(t.owner_responded, 0), COALESCE(t.owner_accepted, 0), COALESCE(t.owner_no_response, 0),
    round(t.med_d_owner::numeric, 1)
  FROM execs e
  CROSS JOIN guard g
  LEFT JOIN timing t ON t.exec_id = e.id
  LEFT JOIN versions v ON v.exec_id = e.id
  LEFT JOIN budget b ON b.exec_id = e.id
  WHERE g.ok
  ORDER BY COALESCE(t.assigned, 0) DESC;
$function$;

CREATE OR REPLACE FUNCTION public.get_inspector_performance(p_market text DEFAULT NULL)
 RETURNS TABLE(inspector_id uuid, inspector_name text, assigned integer, completed integer, in_progress integer, photos integer, photos_per_inspection numeric, fields_filled integer, avg_active_minutes numeric, median_active_minutes numeric, median_hours_to_submit numeric, last_activity_at timestamp with time zone)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
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