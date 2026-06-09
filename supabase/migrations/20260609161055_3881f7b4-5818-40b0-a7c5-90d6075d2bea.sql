ALTER TABLE public.inspection_report_versions
  ADD COLUMN IF NOT EXISTS published_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS inspection_report_versions_published_by_idx
  ON public.inspection_report_versions(published_by);