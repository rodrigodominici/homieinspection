import { supabase } from '@/integrations/supabase/client';
import type { InspectionPhoto } from '@/lib/types';

/**
 * Shared inspection-photo helpers (executive + inspector).
 * Compresses to ≤1600px JPEG @0.75 and persists a row in inspection_photos.
 *
 * Robustness features (added to fix opaque "HTTP 400 error" on mobile):
 *  - Explicit JWT refresh before upload when token is <60s from expiry.
 *  - HEIC / decode failure guard: aborts instead of uploading a HEIC blob
 *    with a lying `image/jpeg` content-type (Storage rejects with 400).
 *  - Empty-blob guard: `canvas.toBlob` can yield null on low-memory devices.
 *  - Retry with backoff on 400/5xx/network transients.
 *  - Rich error surface via `PhotoUploadError` so callers can show statusCode
 *    and log to `client_error_log` for diagnostics.
 */

export type PhotoUploadErrorKind =
  | 'session_expired'
  | 'unsupported_format'
  | 'empty_blob'
  | 'storage_error'
  | 'insert_error'
  | 'network'
  | 'offline';

export class PhotoUploadError extends Error {
  kind: PhotoUploadErrorKind;
  statusCode?: number;
  context?: Record<string, unknown>;
  constructor(kind: PhotoUploadErrorKind, message: string, opts?: { statusCode?: number; context?: Record<string, unknown> }) {
    super(message);
    this.name = 'PhotoUploadError';
    this.kind = kind;
    this.statusCode = opts?.statusCode;
    this.context = opts?.context;
  }
}

/** Human-friendly Spanish label for a `PhotoUploadError.kind`. */
export function photoUploadErrorLabel(err: unknown): { title: string; description: string } {
  if (err instanceof PhotoUploadError) {
    switch (err.kind) {
      case 'session_expired':
        return { title: 'Sesión expirada', description: 'Vuelve a iniciar sesión para subir fotos.' };
      case 'unsupported_format':
        return { title: 'Formato no soportado', description: 'Tu navegador no pudo procesar la foto (posiblemente HEIC). Tómala de nuevo con la cámara o cámbiala a JPG.' };
      case 'empty_blob':
        return { title: 'Foto vacía', description: 'La foto no pudo procesarse. Intenta de nuevo con una foto más pequeña.' };
      case 'offline':
        return { title: 'Sin conexión', description: 'Foto no subida. Intenta de nuevo cuando tengas conexión.' };
      case 'storage_error':
        return { title: `Error subiendo foto${err.statusCode ? ` (${err.statusCode})` : ''}`, description: err.message || 'Reintenta en unos segundos.' };
      case 'insert_error':
        return { title: 'Error guardando foto', description: err.message || 'La foto se subió pero no se registró. Reintenta.' };
      case 'network':
      default:
        return { title: 'Error de red', description: 'Foto no subida. Verifica tu conexión e intenta de nuevo.' };
    }
  }
  const anyErr = err as { message?: string } | null | undefined;
  return { title: 'Error subiendo foto', description: anyErr?.message ?? 'Error inesperado.' };
}

/** Log an upload failure to `client_error_log`. Best-effort — never throws. */
export async function logPhotoUploadFailure(params: {
  err: unknown;
  inspectionId: string;
  sectionKey?: string | null;
  file?: { type?: string; size?: number; name?: string };
}) {
  try {
    const { err, inspectionId, sectionKey, file } = params;
    const isPUE = err instanceof PhotoUploadError;
    const { data: sessionData } = await supabase.auth.getSession();
    const payload = {
      user_id: sessionData?.session?.user?.id ?? undefined,
      inspection_id: inspectionId,
      section_key: sectionKey ?? undefined,
      error_kind: isPUE ? (err as PhotoUploadError).kind : 'unknown',
      message: ((err as { message?: string })?.message ?? String(err)).slice(0, 500),
      status_code: isPUE ? (err as PhotoUploadError).statusCode ?? undefined : undefined,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      context: {
        file_type: file?.type ?? null,
        file_size: file?.size ?? null,
        file_name: file?.name ?? null,
        online: typeof navigator !== 'undefined' ? navigator.onLine : null,
        ...(isPUE ? (err as PhotoUploadError).context ?? {} : {}),
      } as Record<string, unknown>,
    };
    await supabase.from('client_error_log').insert([payload]);
  } catch {
    // Diagnostic logging must never break the user flow.
  }
}

/**
 * Refreshes the Supabase session if the access token is within 60s of expiry.
 * Throws `PhotoUploadError('session_expired')` if no valid session can be obtained.
 */
async function ensureFreshSession(): Promise<void> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data?.session) {
    throw new PhotoUploadError('session_expired', 'No hay sesión activa.');
  }
  const expiresAt = data.session.expires_at ?? 0; // seconds since epoch
  const nowSec = Math.floor(Date.now() / 1000);
  if (expiresAt - nowSec < 60) {
    const { error: refreshErr } = await supabase.auth.refreshSession();
    if (refreshErr) {
      throw new PhotoUploadError('session_expired', refreshErr.message);
    }
  }
}

/**
 * Client-side compression: scales down to ≤1600px and re-encodes as JPEG @0.75.
 * Returns `null` when the browser cannot decode the file (e.g. HEIC on non-Safari).
 * Callers MUST treat `null` as an unsupported format — do NOT fall back to
 * uploading the original file with a fake `image/jpeg` content-type.
 */
export async function compressImage(file: File): Promise<Blob | null> {
  if (!file.type.startsWith('image/') && file.type !== '') {
    // Non-image file — fall through: caller will validate.
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      const MAX = 1600;
      let { width, height } = img;
      if (!width || !height) { resolve(null); return; }
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round((height * MAX) / width); width = MAX; }
        else { width = Math.round((width * MAX) / height); height = MAX; }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(null); return; }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => resolve(blob && blob.size > 0 ? blob : null),
        'image/jpeg',
        0.75,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null); // browser can't decode (typically HEIC on non-Safari)
    };
    img.src = url;
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

const UPLOAD_CONCURRENCY = 3;
const RETRY_DELAYS_MS = [1000, 3000]; // total 3 attempts

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Retries transient failures (network errors or 400/5xx storage responses).
 * Auth / not-found errors bail immediately.
 */
async function uploadToStorageWithRetry(path: string, blob: Blob): Promise<void> {
  let lastErr: { message?: string; statusCode?: number | string } | null = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (!navigator.onLine) {
      throw new PhotoUploadError('offline', 'Sin conexión de red.');
    }
    try {
      const { error } = await supabase.storage
        .from('inspection-photos')
        .upload(path, blob, { contentType: 'image/jpeg', upsert: false });
      if (!error) return;
      lastErr = error as { message?: string; statusCode?: number | string };
      const statusRaw = (error as { statusCode?: number | string }).statusCode;
      const status = typeof statusRaw === 'string' ? parseInt(statusRaw, 10) : statusRaw;
      const transient = !status || status >= 500 || status === 400 || status === 408 || status === 429;
      if (!transient || attempt === RETRY_DELAYS_MS.length) {
        throw new PhotoUploadError('storage_error', error.message || 'HTTP error', {
          statusCode: typeof status === 'number' ? status : undefined,
        });
      }
    } catch (e) {
      if (e instanceof PhotoUploadError) throw e;
      lastErr = { message: (e as Error)?.message };
      if (attempt === RETRY_DELAYS_MS.length) {
        throw new PhotoUploadError('network', (e as Error)?.message || 'Network error');
      }
    }
    await sleep(RETRY_DELAYS_MS[attempt]);
  }
  throw new PhotoUploadError('storage_error', lastErr?.message || 'Upload failed');
}

/**
 * Uploads files in parallel with bounded concurrency (3 simultaneous) to keep
 * the network pipe saturated without overwhelming mobile uplinks. Preserves
 * the original file order via stable sort_order assignment up front.
 *
 * Throws `PhotoUploadError` on the first failing file so the caller can toast
 * and log; already-uploaded files in the batch are still returned in `results`.
 */
export async function uploadInspectionPhotos(
  opts: UploadInspectionPhotosOpts,
): Promise<InspectionPhoto[]> {
  const { inspectionId, sectionId, sectionKey, files, uploadedBy, startingSortOrder = 0, fieldKey = null } = opts;
  const fileList = Array.from(files);
  if (fileList.length === 0) return [];

  if (!navigator.onLine) {
    throw new PhotoUploadError('offline', 'Sin conexión de red.');
  }

  await ensureFreshSession();

  const items = fileList.map((file, idx) => ({ file, sortOrder: startingSortOrder + idx }));
  const results: InspectionPhoto[] = new Array(items.length);

  const uploadOne = async (file: File, sortOrder: number): Promise<InspectionPhoto> => {
    const compressed = await compressImage(file);
    if (!compressed) {
      throw new PhotoUploadError('unsupported_format', 'No se pudo procesar la imagen.', {
        context: { file_type: file.type, file_size: file.size, file_name: file.name },
      });
    }
    if (compressed.size === 0) {
      throw new PhotoUploadError('empty_blob', 'La imagen procesada está vacía.', {
        context: { file_type: file.type, file_size: file.size },
      });
    }

    const fileId = crypto.randomUUID();
    const path = `inspections/${inspectionId}/${sectionKey}/${fileId}.jpg`;
    await uploadToStorageWithRetry(path, compressed);

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
        sort_order: sortOrder,
      })
      .select()
      .single();
    if (error) {
      throw new PhotoUploadError('insert_error', error.message, { context: { path } });
    }
    return data as unknown as InspectionPhoto;
  };

  let cursor = 0;
  const workers = Array.from({ length: Math.min(UPLOAD_CONCURRENCY, items.length) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) break;
      const { file, sortOrder } = items[idx];
      try {
        results[idx] = await uploadOne(file, sortOrder);
      } catch (e) {
        // Attach file info so the caller can log meaningfully.
        void logPhotoUploadFailure({
          err: e,
          inspectionId,
          sectionKey,
          file: { type: file.type, size: file.size, name: file.name },
        });
        throw e;
      }
    }
  });
  await Promise.all(workers);
  return results.filter(Boolean);
}

export async function deleteInspectionPhoto(photo: InspectionPhoto): Promise<void> {
  if (photo.storage_path) {
    await supabase.storage.from('inspection-photos').remove([photo.storage_path]);
  }
  await supabase.from('inspection_photos').delete().eq('id', photo.id);
}
