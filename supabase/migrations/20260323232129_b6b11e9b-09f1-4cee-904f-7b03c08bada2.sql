-- 1. Add approval_status to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending';

-- 2. Update handle_new_user trigger to set pending defaults
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, is_active, approval_status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'role', 'pending'),
    false,
    'pending'
  );
  RETURN NEW;
END;
$$;

-- 3. Create inspection_signatures table
CREATE TABLE public.inspection_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,
  signer_type text NOT NULL DEFAULT 'tenant',
  signer_name text,
  signature_data text,
  signature_status text NOT NULL DEFAULT 'signed',
  skip_reason text,
  signed_at timestamptz DEFAULT now(),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.inspection_signatures ENABLE ROW LEVEL SECURITY;

-- RLS policies for inspection_signatures
CREATE POLICY "Admins can manage all signatures"
  ON public.inspection_signatures FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Inspectors can insert signatures for assigned inspections"
  ON public.inspection_signatures FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM inspections WHERE inspections.id = inspection_signatures.inspection_id AND inspections.inspector_id = auth.uid()
  ));

CREATE POLICY "Inspectors can select signatures for assigned inspections"
  ON public.inspection_signatures FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM inspections WHERE inspections.id = inspection_signatures.inspection_id AND inspections.inspector_id = auth.uid()
  ));

CREATE POLICY "Inspectors can delete signatures for assigned inspections"
  ON public.inspection_signatures FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM inspections WHERE inspections.id = inspection_signatures.inspection_id AND inspections.inspector_id = auth.uid()
  ));

CREATE POLICY "Executives can view signatures of assigned inspections"
  ON public.inspection_signatures FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM inspections WHERE inspections.id = inspection_signatures.inspection_id AND inspections.executive_id = auth.uid()
  ));