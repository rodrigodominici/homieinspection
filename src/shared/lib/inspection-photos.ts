import { supabase } from '@/integrations/supabase/client';
import type { InspectionPhoto } from '@/lib/types';

/**
 * Shared inspection-photo helpers (executive + inspector).
 * Compresses to ≤1920px JPEG @0.8 and persists a row in inspection_photos.
 */

/**
 * Client-side compression: scales down to ≤1920px and re-encodes as JPEG @0.8.
 * Exported so page components can use it directly without duplicating the logic.
 */
export async function compressImage(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX = 1920;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round((height * MAX) / width); width = MAX; }
        else { width = Math.round((width * MAX) / height); height = MAX; }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => resolve(blob || file), 'image/jpeg', 0.8);
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
}

export interface UploadInspectionPhotosOpts {
  inspectionId: string;
  sectionId: string;
  sectionKey: string;
  files: FileList | File[];
  uploadedBy?: string;
  startingSortOrder?: number;
  fieldKey?: string | null;
}

export async function uploadInspectionPhotos(
  opts: UploadInspectionPhotosOpts,
): Promise<InspectionPhoto[]> {
  const { inspectionId, sectionId, sectionKey, files, uploadedBy, startingSortOrder = 0, fieldKey = null } = opts;
  const out: InspectionPhoto[] = [];
  let sort = startingSortOrder;
  for (const file of Array.from(files)) {
    const fileId = crypto.randomUUID();
    const compressed = await compressImage(file);
    const path = `inspections/${inspectionId}/${sectionKey}/${fileId}.jpg`;
    const { error: upErr } = await supabase.storage
      .from('inspection-photos')
      .upload(path, compressed, { contentType: 'image/jpeg' });
    if (upErr) throw upErr;
    const { data, error } = await supabase
      .from('inspection_photos')
      .insert({
        inspection_id: inspectionId,
        inspection_section_id: sectionId,
        field_key: fieldKey,
        group_key: 'photo',
        storage_bucket: 'inspection-photos',
        storage_path: path,
        uploaded_by: uploadedBy ?? null,
        sort_order: sort++,
      })
      .select()
      .single();
    if (error) throw error;
    out.push(data as unknown as InspectionPhoto);
  }
  return out;
}

export async function deleteInspectionPhoto(photo: InspectionPhoto): Promise<void> {
  if (photo.storage_path) {
    await supabase.storage.from('inspection-photos').remove([photo.storage_path]);
  }
  await supabase.from('inspection_photos').delete().eq('id', photo.id);
}
