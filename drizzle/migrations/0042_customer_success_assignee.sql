ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS customer_success_name text,
  ADD COLUMN IF NOT EXISTS customer_success_email text,
  ADD COLUMN IF NOT EXISTS customer_success_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS customer_success_synced_at timestamptz;
CREATE INDEX IF NOT EXISTS inspections_customer_success_profile_idx ON public.inspections(customer_success_profile_id);