import { supabase } from '@/integrations/supabase/client';
import { compressImage } from '@/shared/lib/inspection-photos';

/** Records a final check (cumple / no cumple) with an optional compressed photo. */
export async function recordFinalCheck(input: { inspectionId: string; itemId: string; complies: boolean; comment: string | null; photo?: File | null }) {
  let photoPath: string | null = null;
  if (input.photo) {
    const blob = (await compressImage(input.photo)) ?? input.photo;
    photoPath = `inspections/${input.inspectionId}/final_checks/${input.itemId}-${Date.now()}.jpg`;
    const { error } = await supabase.storage.from('inspection-photos').upload(photoPath, blob, { contentType: 'image/jpeg' });
    if (error) return { error: { message: 'photo_upload_failed' } };
  }
  const { error } = await supabase.rpc('record_final_check', {
    p_item_id: input.itemId, p_complies: input.complies, p_comment: input.comment, p_photo_path: photoPath,
  });
  return { error };
}

export function finalCheckErrorText(message: string): string {
  if (message.includes('note_required')) return 'Escribí qué no cumple';
  if (message.includes('invalid_status')) return 'La OT debe estar enviada por el contratista';
  if (message.includes('photo_upload_failed')) return 'No se pudo subir la foto';
  return 'No se pudo guardar';
}
