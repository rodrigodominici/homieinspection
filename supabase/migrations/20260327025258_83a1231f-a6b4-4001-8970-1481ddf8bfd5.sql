ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS contractor_id uuid REFERENCES public.contractors(id);

ALTER TABLE public.inspection_repair_items
  ADD COLUMN IF NOT EXISTS contractor_unit_price numeric NOT NULL DEFAULT 0;