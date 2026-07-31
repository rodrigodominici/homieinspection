CREATE OR REPLACE FUNCTION public.get_executive_performance()
RETURNS TABLE(
  executive_id uuid,
  executive_name text,
  assigned int,
  published int,
  median_hours_to_review numeric,
  median_hours_to_publish numeric,
  report_versions int,
  inspections_with_versions int,
  versions_per_report numeric,
  repair_items int,
  inspections_with_items int,
  items_per_inspection numeric,
  client_amount numeric,
  contractor_cost numeric,
  margin_pct numeric,
  owner_responded int,
  owner_accepted int,
  owner_no_response int,
  median_days_owner_response numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH guard AS (
    SELECT CASE
      WHEN public.has_role(auth.uid(), 'admin') THEN true
      ELSE (SELECT true WHERE false)
    END AS ok
  ),
  execs AS (
    SELECT p.id, COALESCE(p.full_name, p.email) AS name
    FROM public.profiles p
    WHERE p.role = 'executive'
  ),
  insp AS (
    SELECT i.*, e.id AS exec_id
    FROM public.inspections i
    JOIN execs e ON e.id = i.executive_id
  ),
  timing AS (
    SELECT
      exec_id,
      count(*)::int AS assigned,
      count(*) FILTER (WHERE published_at IS NOT NULL)::int AS published,
      percentile_cont(0.5) WITHIN GROUP (
        ORDER BY extract(epoch FROM (review_completed_at - completed_at)) / 3600
      ) FILTER (WHERE review_completed_at > completed_at) AS med_h_review,
      percentile_cont(0.5) WITHIN GROUP (
        ORDER BY extract(epoch FROM (published_at - completed_at)) / 3600
      ) FILTER (WHERE published_at > completed_at) AS med_h_publish,
      count(*) FILTER (WHERE owner_feedback_last_submitted_at IS NOT NULL)::int AS owner_responded,
      count(*) FILTER (WHERE owner_feedback_status = 'accepted')::int AS owner_accepted,
      count(*) FILTER (WHERE published_at IS NOT NULL AND owner_feedback_last_submitted_at IS NULL)::int AS owner_no_response,
      percentile_cont(0.5) WITHIN GROUP (
        ORDER BY extract(epoch FROM (owner_feedback_last_submitted_at - published_at)) / 86400
      ) FILTER (WHERE owner_feedback_last_submitted_at > published_at) AS med_d_owner
    FROM insp
    GROUP BY exec_id
  ),
  versions AS (
    SELECT i.exec_id,
           count(*)::int AS versions,
           count(DISTINCT v.inspection_id)::int AS insp_with_versions
    FROM public.inspection_report_versions v
    JOIN insp i ON i.id = v.inspection_id
    GROUP BY i.exec_id
  ),
  budget AS (
    SELECT i.exec_id,
           count(*)::int AS items,
           count(DISTINCT r.inspection_id)::int AS insp_with_items,
           COALESCE(sum(r.subtotal), 0)::numeric AS client_amount,
           COALESCE(sum(r.contractor_unit_price * r.quantity), 0)::numeric AS contractor_cost
    FROM public.inspection_repair_items r
    JOIN insp i ON i.id = r.inspection_id
    GROUP BY i.exec_id
  )
  SELECT
    e.id,
    e.name,
    COALESCE(t.assigned, 0),
    COALESCE(t.published, 0),
    round(t.med_h_review::numeric, 1),
    round(t.med_h_publish::numeric, 1),
    COALESCE(v.versions, 0),
    COALESCE(v.insp_with_versions, 0),
    CASE WHEN COALESCE(v.insp_with_versions, 0) > 0
      THEN round(v.versions::numeric / v.insp_with_versions, 1) END,
    COALESCE(b.items, 0),
    COALESCE(b.insp_with_items, 0),
    CASE WHEN COALESCE(b.insp_with_items, 0) > 0
      THEN round(b.items::numeric / b.insp_with_items, 1) END,
    COALESCE(b.client_amount, 0),
    COALESCE(b.contractor_cost, 0),
    CASE WHEN COALESCE(b.client_amount, 0) > 0
      THEN round(100 * (b.client_amount - b.contractor_cost) / b.client_amount, 1) END,
    COALESCE(t.owner_responded, 0),
    COALESCE(t.owner_accepted, 0),
    COALESCE(t.owner_no_response, 0),
    round(t.med_d_owner::numeric, 1)
  FROM execs e
  CROSS JOIN guard g
  LEFT JOIN timing t ON t.exec_id = e.id
  LEFT JOIN versions v ON v.exec_id = e.id
  LEFT JOIN budget b ON b.exec_id = e.id
  WHERE g.ok
  ORDER BY COALESCE(t.assigned, 0) DESC;
$$;

REVOKE ALL ON FUNCTION public.get_executive_performance() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_executive_performance() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_executive_performance() TO service_role;