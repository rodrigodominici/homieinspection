-- Registro de archivos: el receptor asignado a un check-in puede ver y crear su informe
CREATE POLICY "Assigned advisor reads checkin report files"
ON public.inspection_report_files
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.inspections i
    WHERE i.id = inspection_report_files.inspection_id
      AND i.inspection_type = 'check_in'
      AND i.inspector_id = (SELECT auth.uid())
  )
);

CREATE POLICY "Assigned advisor creates checkin report files"
ON public.inspection_report_files
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.inspections i
    WHERE i.id = inspection_report_files.inspection_id
      AND i.inspection_type = 'check_in'
      AND i.inspector_id = (SELECT auth.uid())
  )
);

-- Storage: lectura y subida del PDF para el receptor asignado al check-in.
-- La ruta del archivo empieza con el id de la inspección.
CREATE POLICY "Assigned advisor reads checkin report pdfs"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'inspection-reports'
  AND EXISTS (
    SELECT 1 FROM public.inspections i
    WHERE i.id::text = split_part(storage.objects.name, '/', 1)
      AND i.inspection_type = 'check_in'
      AND i.inspector_id = (SELECT auth.uid())
  )
);

CREATE POLICY "Assigned advisor uploads checkin report pdfs"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'inspection-reports'
  AND EXISTS (
    SELECT 1 FROM public.inspections i
    WHERE i.id::text = split_part(storage.objects.name, '/', 1)
      AND i.inspection_type = 'check_in'
      AND i.inspector_id = (SELECT auth.uid())
  )
);

CREATE POLICY "Assigned advisor updates checkin report pdfs"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'inspection-reports'
  AND EXISTS (
    SELECT 1 FROM public.inspections i
    WHERE i.id::text = split_part(storage.objects.name, '/', 1)
      AND i.inspection_type = 'check_in'
      AND i.inspector_id = (SELECT auth.uid())
  )
);