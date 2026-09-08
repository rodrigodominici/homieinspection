CREATE TABLE public.inspection_report_files (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  inspection_id uuid NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,
  report_version_id uuid REFERENCES public.inspection_report_versions(id) ON DELETE SET NULL,
  audience text NOT NULL DEFAULT 'tenant',
  storage_path text NOT NULL,
  bytes bigint NOT NULL DEFAULT 0,
  generated_by uuid REFERENCES public.profiles(id),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_inspection_report_files_inspection ON public.inspection_report_files (inspection_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inspection_report_files TO authenticated;
GRANT ALL ON public.inspection_report_files TO service_role;

ALTER TABLE public.inspection_report_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and executives manage report files"
ON public.inspection_report_files FOR ALL TO authenticated
USING (public.has_role((SELECT auth.uid()), 'admin') OR public.has_role((SELECT auth.uid()), 'executive'))
WITH CHECK (public.has_role((SELECT auth.uid()), 'admin') OR public.has_role((SELECT auth.uid()), 'executive'));

CREATE POLICY "Admins and executives read report pdfs"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'inspection-reports' AND (public.has_role((SELECT auth.uid()), 'admin') OR public.has_role((SELECT auth.uid()), 'executive')));

CREATE POLICY "Admins and executives upload report pdfs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'inspection-reports' AND (public.has_role((SELECT auth.uid()), 'admin') OR public.has_role((SELECT auth.uid()), 'executive')));

CREATE POLICY "Admins and executives update report pdfs"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'inspection-reports' AND (public.has_role((SELECT auth.uid()), 'admin') OR public.has_role((SELECT auth.uid()), 'executive')));

CREATE POLICY "Admins and executives delete report pdfs"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'inspection-reports' AND (public.has_role((SELECT auth.uid()), 'admin') OR public.has_role((SELECT auth.uid()), 'executive')));