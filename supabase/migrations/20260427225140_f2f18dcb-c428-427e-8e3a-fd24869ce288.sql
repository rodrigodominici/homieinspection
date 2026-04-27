ALTER TABLE public.inspection_repair_items
  ADD COLUMN payer_role text NOT NULL DEFAULT 'owner',
  ADD COLUMN payment_nature text NOT NULL DEFAULT 'required';

ALTER TABLE public.inspection_repair_items
  ADD CONSTRAINT inspection_repair_items_payer_role_check
    CHECK (payer_role IN ('owner', 'tenant')),
  ADD CONSTRAINT inspection_repair_items_payment_nature_check
    CHECK (payment_nature IN ('required', 'optional'));