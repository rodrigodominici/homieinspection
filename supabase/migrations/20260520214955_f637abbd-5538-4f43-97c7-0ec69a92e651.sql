CREATE POLICY "Executives can delete photos of assigned inspections"
ON public.inspection_photos
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.inspections i
    WHERE i.id = inspection_photos.inspection_id
      AND i.executive_id = auth.uid()
  )
);

CREATE POLICY "Executives can insert photos for assigned inspections"
ON public.inspection_photos
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.inspections i
    WHERE i.id = inspection_photos.inspection_id
      AND i.executive_id = auth.uid()
  )
);