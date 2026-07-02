-- Deduplicate any existing rows (keep most recent per inspection)
DELETE FROM public.inspection_signatures a
USING public.inspection_signatures b
WHERE a.inspection_id = b.inspection_id
  AND a.created_at < b.created_at;

-- Unique constraint enabling upsert
ALTER TABLE public.inspection_signatures
  ADD CONSTRAINT inspection_signatures_inspection_id_unique UNIQUE (inspection_id);

-- Data integrity: a "signed" row must carry signature_data
ALTER TABLE public.inspection_signatures
  ADD CONSTRAINT inspection_signatures_signed_requires_data
  CHECK (signature_status <> 'signed' OR signature_data IS NOT NULL);

-- updated_at column + trigger for auditing replacements
ALTER TABLE public.inspection_signatures
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS update_inspection_signatures_updated_at ON public.inspection_signatures;
CREATE TRIGGER update_inspection_signatures_updated_at
  BEFORE UPDATE ON public.inspection_signatures
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();