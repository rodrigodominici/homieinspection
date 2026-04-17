/**
 * Photo URL helper.
 *
 * Returns a short-lived signed URL for an inspection photo's storage path.
 * The `inspection-photos` bucket is private — never use `getPublicUrl` for it.
 * TTL: 1 hour.
 */
import { supabase } from '@/integrations/supabase/client';

const cache = new Map<string, { url: string; expiresAt: number }>();
const TTL_SECONDS = 3600;

export async function getSignedPhotoUrl(storagePath: string | null | undefined): Promise<string> {
  if (!storagePath) return '';
  const cached = cache.get(storagePath);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.url;

  const { data, error } = await supabase.storage
    .from('inspection-photos')
    .createSignedUrl(storagePath, TTL_SECONDS);

  if (error || !data?.signedUrl) return '';
  cache.set(storagePath, { url: data.signedUrl, expiresAt: Date.now() + TTL_SECONDS * 1000 });
  return data.signedUrl;
}

/**
 * React hook helper: resolve signed URLs for an array of photos by storage_path.
 * Returns a map keyed by photo id.
 */
export async function getSignedPhotoUrlMap<T extends { id: string; storage_path: string }>(
  photos: T[],
): Promise<Record<string, string>> {
  const entries = await Promise.all(
    photos.map(async (p) => [p.id, await getSignedPhotoUrl(p.storage_path)] as const),
  );
  return Object.fromEntries(entries);
}
