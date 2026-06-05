CREATE TABLE public.inspection_quotation_discounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL,
  discount_type text NOT NULL CHECK (discount_type IN ('percentage','fixed')),
  discount_value numeric NOT NULL CHECK (discount_value >= 0),
  discount_reason text,
  is_active boolean NOT NULL DEFAULT true,
  applied_by uuid,
  applied_at timestamptz NOT NULL DEFAULT now(),
  removed_by uuid,
  removed_at timestamptz,
  superseded_by_id uuid REFERENCES public.inspection_quotation_discounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT percentage_max_100 CHECK (
    discount_type <> 'percentage' OR discount_value <= 100
  )
);

CREATE UNIQUE INDEX inspection_quotation_discounts_active_unique
  ON public.inspection_quotation_discounts (inspection_id)
  WHERE is_active = true;

CREATE INDEX inspection_quotation_discounts_inspection_idx
  ON public.inspection_quotation_discounts (inspection_id, applied_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inspection_quotation_discounts TO authenticated;
GRANT ALL ON public.inspection_quotation_discounts TO service_role;

ALTER TABLE public.inspection_quotation_discounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all quotation discounts"
ON public.inspection_quotation_discounts
FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Executives view discounts of assigned inspections"
ON public.inspection_quotation_discounts
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.inspections i
    WHERE i.id = inspection_quotation_discounts.inspection_id
      AND i.executive_id = auth.uid()
  )
);

CREATE POLICY "Executives insert discounts on assigned inspections"
ON public.inspection_quotation_discounts
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.inspections i
    WHERE i.id = inspection_quotation_discounts.inspection_id
      AND i.executive_id = auth.uid()
  )
);

CREATE POLICY "Executives update discounts of assigned inspections"
ON public.inspection_quotation_discounts
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.inspections i
    WHERE i.id = inspection_quotation_discounts.inspection_id
      AND i.executive_id = auth.uid()
  )
);

CREATE TRIGGER update_inspection_quotation_discounts_updated_at
BEFORE UPDATE ON public.inspection_quotation_discounts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();