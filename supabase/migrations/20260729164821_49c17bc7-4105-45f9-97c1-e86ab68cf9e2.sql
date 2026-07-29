
-- Extend visibility helper to both inspection types and include 'sent'
CREATE OR REPLACE FUNCTION public.is_visible_checkout_for_comercial(_inspection_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.inspections i
    WHERE i.id = _inspection_id
      AND i.inspection_type IN ('check_out','captacion')
      AND i.status IN ('submitted','in_review','approved','published','accepted','sent')
  );
$function$;

-- Replace inspections SELECT policy for comercial
DROP POLICY IF EXISTS "Comercial can view submitted check-outs" ON public.inspections;
CREATE POLICY "Comercial can view submitted inspections"
ON public.inspections
FOR SELECT
USING (
  has_role(auth.uid(), 'comercial')
  AND inspection_type IN ('check_out','captacion')
  AND status IN ('submitted','in_review','approved','published','accepted','sent')
);
