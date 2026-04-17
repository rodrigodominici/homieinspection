/**
 * Photo URL helper.
 *
 * The `inspection-photos` bucket is private. Never use `getPublicUrl` for it.
 * All reads go through `createSignedUrl` (TTL 1h).
 */
import { useEffect, useState } from 'react';
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

export async function getSignedPhotoUrlMap<T extends { id: string; storage_path: string }>(
  photos: T[],
): Promise<Record<string, string>> {
  const entries = await Promise.all(
    photos.map(async (p) => [p.id, await getSignedPhotoUrl(p.storage_path)] as const),
  );
  return Object.fromEntries(entries);
}

/**
 * React hook: returns `(photoId) => signedUrl` for the given photos, refreshing
 * whenever the photo set changes by id list.
 */
export function useSignedPhotoUrls<T extends { id: string; storage_path: string }>(
  photos: T[],
): (id: string) => string {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = photos.map((p) => p.id).join(',');

  useEffect(() => {
    if (!photos.length) { setUrls({}); return; }
    let cancelled = false;
    getSignedPhotoUrlMap(photos).then((m) => { if (!cancelled) setUrls(m); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (id: string) => urls[id] ?? '';
}
