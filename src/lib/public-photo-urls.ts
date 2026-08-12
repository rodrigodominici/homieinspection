/**
 * Batched signing of public-report photos.
 *
 * Public reports run as anon, so each photo needs a signed URL from the
 * `sign-public-photo` edge function. Signing them one by one meant one edge
 * invocation (and three DB queries) per image — hundreds per report view, which
 * was the single largest load source on the backend.
 *
 * This module collects the ids requested during a short window and resolves
 * them with a single call, caching results for the whole page session.
 */
import { supabase } from '@/integrations/supabase/client';

const BATCH_WINDOW_MS = 60;
const MAX_BATCH = 100;

interface Pending {
  ids: Set<string>;
  timer: ReturnType<typeof setTimeout> | null;
  resolvers: Map<string, ((url: string | null) => void)[]>;
}

const cache = new Map<string, string>();            // `${key}:${photoId}` → url
const queues = new Map<string, Pending>();          // key → pending batch

const keyOf = (propertyId: string, token: string) => `${propertyId}|${token}`;

async function flush(key: string, propertyId: string, token: string) {
  const pending = queues.get(key);
  if (!pending) return;
  queues.delete(key);
  if (pending.timer) clearTimeout(pending.timer);

  const ids = Array.from(pending.ids).slice(0, MAX_BATCH);
  const leftover = Array.from(pending.ids).slice(MAX_BATCH);

  try {
    const { data, error } = await supabase.functions.invoke('sign-public-photo', {
      body: { property_id: propertyId, token, photo_ids: ids },
    });
    const urls = (data?.urls ?? {}) as Record<string, string>;
    for (const id of ids) {
      const url = error ? null : (urls[id] ?? null);
      if (url) cache.set(`${key}:${id}`, url);
      for (const resolve of pending.resolvers.get(id) ?? []) resolve(url);
      pending.resolvers.delete(id);
    }
  } catch {
    for (const id of ids) {
      for (const resolve of pending.resolvers.get(id) ?? []) resolve(null);
      pending.resolvers.delete(id);
    }
  }

  // Requeue anything above the batch cap.
  for (const id of leftover) {
    for (const resolve of pending.resolvers.get(id) ?? []) {
      void getPublicPhotoUrl(propertyId, token, id).then(resolve);
    }
  }
}

/** Resolves a signed URL for one photo, batching the underlying request. */
export function getPublicPhotoUrl(
  propertyId: string,
  token: string,
  photoId: string,
): Promise<string | null> {
  const key = keyOf(propertyId, token);
  const cached = cache.get(`${key}:${photoId}`);
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve) => {
    let pending = queues.get(key);
    if (!pending) {
      pending = { ids: new Set(), timer: null, resolvers: new Map() };
      queues.set(key, pending);
    }
    pending.ids.add(photoId);
    const list = pending.resolvers.get(photoId) ?? [];
    list.push(resolve);
    pending.resolvers.set(photoId, list);

    if (!pending.timer) {
      pending.timer = setTimeout(() => void flush(key, propertyId, token), BATCH_WINDOW_MS);
    }
  });
}
