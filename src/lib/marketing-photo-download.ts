import JSZip from 'jszip';
import { supabase } from '@/integrations/supabase/client';

export interface MarketingPhoto {
  id: string;
  inspection_id: string;
  storage_bucket: string;
  storage_path: string;
  caption: string | null;
  created_at: string;
  captacion_date: string;
}

export function photoFilename(photo: MarketingPhoto, index: number): string {
  const extension = photo.storage_path.split('.').pop()?.toLowerCase();
  const safeExtension = extension && /^(jpg|jpeg|png|webp|heic)$/.test(extension) ? extension : 'jpg';
  return `${String(index + 1).padStart(3, '0')}-${photo.id}.${safeExtension}`;
}

export function saveMarketingFile(blob: Blob, name: string) {
  const file = new File([blob], name, { type: blob.type });
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    void navigator.share({ files: [file], title: name }).catch(() => {});
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function fetchMarketingPhoto(photo: MarketingPhoto): Promise<Blob> {
  const { data, error } = await supabase.storage.from(photo.storage_bucket).download(photo.storage_path);
  if (error || !data || !data.size) throw new Error('No se pudo descargar una foto. Volvé a intentar con conexión.');
  return data;
}

export async function buildMarketingZip(photos: MarketingPhoto[], download: (photo: MarketingPhoto) => Promise<Blob> = fetchMarketingPhoto): Promise<Blob> {
  if (!photos.length) throw new Error('No hay fotos para descargar.');
  const zip = new JSZip();
  // Small batches keep network and memory usage bounded while preserving originals.
  for (let start = 0; start < photos.length; start += 4) {
    await Promise.all(photos.slice(start, start + 4).map(async (photo, offset) => {
      zip.file(photoFilename(photo, start + offset), await (await download(photo)).arrayBuffer());
    }));
  }
  return zip.generateAsync({ type: 'blob', compression: 'STORE' });
}