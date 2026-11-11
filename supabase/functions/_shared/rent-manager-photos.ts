export type PhotoObject = { bucket: string; path: string };

/** Final-photo notifications replace the receiver's gallery, including an empty gallery. */
export async function preparePhotoPayload(
  row: { event_type: string; inspection_id: string; payload: Record<string, any>; photo_objects?: PhotoObject[] },
  currentFinalPhotos: (inspectionId: string) => Promise<PhotoObject[]>,
  sign: (photo: PhotoObject) => Promise<string>,
) {
  const payload = structuredClone(row.payload);
  const photos = row.event_type === 'inspection.final_photos_ready'
    ? await currentFinalPhotos(row.inspection_id)
    : row.photo_objects ?? [];
  if (row.event_type === 'inspection.final_photos_ready' || photos.length > 0) {
    payload.data.fotos = [];
    for (const photo of photos) {
      if (photo.bucket !== 'inspection-photos') throw new Error('invalid_photo_bucket');
      payload.data.fotos.push(await sign(photo));
    }
  }
  return payload;
}