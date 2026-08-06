/**
 * Photo URL helper.
 *
 * The `inspection-photos` bucket is private. Never use `getPublicUrl` for it.
 * All reads go through `createSignedUrl` (TTL 1h).
 *
 * Cache design:
 *  - Bounded to MAX_CACHE_SIZE entries (FIFO eviction) to prevent memory leaks
 *    in long-running inspector/executive sessions.
 *  - URLs are refreshed only in the last REFRESH_BUFFER_MS of their lifetime
 *    (5 min before expiry) — avoids re-signing URLs that still have 50+ min left.
 *  - On signing failure: retries once after 1 s, then falls back to any cached
 *    (possibly stale) URL rather than returning an empty string (broken image).
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

const TTL_SECONDS = 3600;
const REFRESH_BUFFER_MS = 5 * 60 * 1000; // refresh only in last 5 min of lifetime
const MAX_CACHE_SIZE = 300;              // ~300 photos max in memory

const cache = new Map<string, { url: string; expiresAt: number }>();

/** Evict oldest entries when cache exceeds the size limit. */
function pruneCache() {
  if (cache.size <= MAX_CACHE_SIZE) return;
  const toDelete = cache.size - MAX_CACHE_SIZE;
  let count = 0;
  for (const key of cache.keys()) {
    cache.delete(key);
    if (++count >= toDelete) break;
  }
}

async function sign(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('inspection-photos')
    .createSignedUrl(storagePath, TTL_SECONDS);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export async function getSignedPhotoUrl(storagePath: string | null | undefined): Promise<string> {
  if (!storagePath) return '';

  const cached = cache.get(storagePath);
  // Use cached URL if it has more than REFRESH_BUFFER_MS of life left
  if (cached && cached.expiresAt > Date.now() + REFRESH_BUFFER_MS) return cached.url;

  try {
    let url = await sign(storagePath);

    // One retry on transient failure
    if (!url) {
      await new Promise((r) => setTimeout(r, 1000));
      url = await sign(storagePath);
    }

    if (url) {
      cache.set(storagePath, { url, expiresAt: Date.now() + TTL_SECONDS * 1000 });
      pruneCache();
      return url;
    }

    // Signing failed twice — return stale cached URL if available (better than broken image)
    return cached?.url ?? '';
  } catch {
    return cached?.url ?? '';
  }
}

/**
 * Batch-signs every photo in a single request (`createSignedUrls` accepts an
 * array), instead of one round-trip per photo. Paths already cached with more
 * than REFRESH_BUFFER_MS of life left are served from memory and excluded from
 * the request. Falls back to individual signing only if the batch call fails.
 */
export async function getSignedPhotoUrlMap<T extends { id: string; storage_path: string }>(
  photos: T[],
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  const now = Date.now();
  const missing: string[] = [];

  for (const p of photos) {
    if (!p.storage_path) { result[p.id] = ''; continue; }
    const cached = cache.get(p.storage_path);
    if (cached && cached.expiresAt > now + REFRESH_BUFFER_MS) {
      result[p.id] = cached.url;
    } else if (!missing.includes(p.storage_path)) {
      missing.push(p.storage_path);
    }
  }

  if (missing.length) {
    try {
      const { data, error } = await supabase.storage
        .from('inspection-photos')
        .createSignedUrls(missing, TTL_SECONDS);
      if (error) throw error;
      for (const item of data ?? []) {
        if (item.signedUrl && item.path) {
          cache.set(item.path, { url: item.signedUrl, expiresAt: Date.now() + TTL_SECONDS * 1000 });
        }
      }
      pruneCache();
    } catch {
      // Batch failed — fall back to per-path signing (with its own retry).
      await Promise.all(missing.map((path) => getSignedPhotoUrl(path)));
    }

    for (const p of photos) {
      if (result[p.id] !== undefined) continue;
      result[p.id] = cache.get(p.storage_path)?.url ?? '';
    }
  }

  return result;
}

/* ────────────────────────────── Thumbnails ──────────────────────────────── */

const THUMB_WIDTH = 480;
const THUMB_QUALITY = 65;
const thumbKey = (path: string) => `thumb:${THUMB_WIDTH}:${path}`;

/**
 * Signs a transformed (resized) variant of a photo. Storage transformations
 * must be requested at sign time, so these can't be batched like originals;
 * requests are issued in small parallel chunks instead. A grid thumbnail drops
 * from ~300 KB (1600 px original) to ~25 KB.
 */
async function signThumb(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('inspection-photos')
    .createSignedUrl(storagePath, TTL_SECONDS, {
      transform: { width: THUMB_WIDTH, quality: THUMB_QUALITY, resize: 'contain' },
    });
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

async function getSignedThumbUrlMap<T extends { id: string; storage_path: string }>(
  photos: T[],
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  const now = Date.now();
  const pending: string[] = [];

  for (const p of photos) {
    if (!p.storage_path) { result[p.id] = ''; continue; }
    const cached = cache.get(thumbKey(p.storage_path));
    if (cached && cached.expiresAt > now + REFRESH_BUFFER_MS) {
      result[p.id] = cached.url;
    } else if (!pending.includes(p.storage_path)) {
      pending.push(p.storage_path);
    }
  }

  const CHUNK = 8;
  for (let i = 0; i < pending.length; i += CHUNK) {
    const chunk = pending.slice(i, i + CHUNK);
    await Promise.all(
      chunk.map(async (path) => {
        try {
          const url = await signThumb(path);
          if (url) cache.set(thumbKey(path), { url, expiresAt: Date.now() + TTL_SECONDS * 1000 });
        } catch { /* fall back to the original URL */ }
      }),
    );
  }
  pruneCache();

  for (const p of photos) {
    if (result[p.id] !== undefined) continue;
    result[p.id] = cache.get(thumbKey(p.storage_path))?.url ?? '';
  }

  return result;
}

/**
 * React hook: returns `(photoId, variant?) => signedUrl` for the given photos,
 * refreshing whenever the photo set changes by id list. Pass `'thumb'` for grid
 * rendering (small transformed variant) and omit it for lightbox/full view.
 */
export function useSignedPhotoUrls<T extends { id: string; storage_path: string }>(
  photos: T[],
): (id: string, variant?: 'full' | 'thumb') => string {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const key = photos.map((p) => p.id).join(',');

  useEffect(() => {
    if (!photos.length) { setUrls({}); setThumbs({}); return; }
    let cancelled = false;

    const refresh = () => {
      getSignedPhotoUrlMap(photos).then((m) => { if (!cancelled) setUrls(m); });
      getSignedThumbUrlMap(photos).then((m) => { if (!cancelled) setThumbs(m); });
    };

    refresh();

    // Auto-refresh every 50 min — covers long inspector/executive sessions
    // (>55 min) where the initial 1h-TTL URLs would otherwise expire mid-use.
    // Cached URLs with >5 min of life left are reused, so this is cheap.
    const interval = window.setInterval(refresh, 50 * 60 * 1000);

    return () => { cancelled = true; window.clearInterval(interval); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (id: string, variant: 'full' | 'thumb' = 'full') =>
    (variant === 'thumb' ? thumbs[id] || urls[id] : urls[id]) ?? '';
}


