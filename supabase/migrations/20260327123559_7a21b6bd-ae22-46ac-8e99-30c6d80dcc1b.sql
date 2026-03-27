
CREATE TABLE public.repair_catalog_item_contractor_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_catalog_item_id uuid NOT NULL REFERENCES public.repair_catalog_items(id) ON DELETE CASCADE,
  contractor_id uuid NOT NULL REFERENCES public.contractors(id) ON DELETE CASCADE,
  price numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'MXN',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (repair_catalog_item_id, contractor_id)
);

ALTER TABLE public.repair_catalog_item_contractor_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage contractor prices"
  ON public.repair_catalog_item_contractor_prices
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Executives can read contractor prices"
  ON public.repair_catalog_item_contractor_prices
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'executive'));
