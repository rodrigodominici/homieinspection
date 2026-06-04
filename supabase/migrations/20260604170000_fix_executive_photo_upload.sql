-- Fix: Executive role was missing INSERT and DELETE storage policies
-- for the inspection-photos bucket. Only SELECT was granted (ADR-001 migration).
-- This prevented executives from uploading or deleting photos in their assigned inspections.

-- Executive INSERT: allow uploading to assigned inspections
CREATE POLICY inspection_photos_executive_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'inspection-photos'
  AND EXISTS (
    SELECT 1 FROM public.inspections i
    WHERE i.executive_id = auth.uid()
      AND name LIKE 'inspections/' || i.id::text || '/%'
  )
);

-- Executive DELETE: allow deleting from assigned inspections
CREATE POLICY inspection_photos_executive_delete ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'inspection-photos'
  AND EXISTS (
    SELECT 1 FROM public.inspections i
    WHERE i.executive_id = auth.uid()
      AND name LIKE 'inspections/' || i.id::text || '/%'
  )
);
