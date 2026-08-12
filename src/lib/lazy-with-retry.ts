/**
 * Resilient route loading.
 *
 * Every screen is a separate JS chunk with a content-hashed, immutably cached
 * filename. After a deploy, a tab or installed PWA that has been open for a
 * while still references the *previous* chunk names — those files no longer
 * exist, the dynamic import rejects, and the user sees a blank screen or an
 * eternal spinner.
 *
 * `lazyWithRetry` turns that into a transparent recovery:
 *   1. retry the import once (covers flaky mobile networks),
 *   2. if it still fails, unregister service workers + clear caches and
 *      hard-reload once per session (guarded by sessionStorage so we can
 *      never end up in a reload loop),
 *   3. only if the reload already happened do we surface the error.
 */
import { lazy, type ComponentType } from 'react';
import { logClientEvent } from '@/lib/client-log';

const RELOAD_FLAG = 'homie_chunk_reload_at';
const RELOAD_COOLDOWN_MS = 60_000;

const CHUNK_ERROR_RE =
  /(dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk|Failed to fetch)/i;

export function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err ?? '');
  return CHUNK_ERROR_RE.test(msg);
}

/** True when a recovery reload already happened recently (avoids loops). */
function reloadedRecently(): boolean {
  try {
    const raw = sessionStorage.getItem(RELOAD_FLAG);
    if (!raw) return false;
    return Date.now() - Number(raw) < RELOAD_COOLDOWN_MS;
  } catch {
    return false;
  }
}

function markReloaded(): void {
  try {
    sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
  } catch {
    /* private mode — worst case we reload twice */
  }
}

/** Drops the service worker + its caches so the reload fetches the new build. */
async function clearStaleCaches(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    /* best effort */
  }
}

/** Recovers from a stale build by clearing caches and reloading once. */
export async function recoverFromStaleBuild(reason: string): Promise<void> {
  if (reloadedRecently()) return;
  markReloaded();
  logClientEvent({ kind: 'chunk_load_failed', message: reason, context: { action: 'reload' } });
  await clearStaleCaches();
  window.location.reload();
}

export function lazyWithRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
  name: string,
) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (first) {
      // Transient network hiccup — one quick retry before anything drastic.
      await new Promise((r) => setTimeout(r, 500));
      try {
        return await factory();
      } catch (err) {
        if (isChunkLoadError(err)) {
          await recoverFromStaleBuild(`${name}: ${String((err as Error)?.message ?? err)}`);
          // Keep the promise pending while the page reloads, so React does not
          // flash an error screen during navigation away.
          if (!reloadedRecently()) throw err;
          return await new Promise<{ default: T }>(() => {});
        }
        logClientEvent({
          kind: 'chunk_load_failed',
          message: `${name}: ${String((err as Error)?.message ?? err)}`,
        });
        throw err;
      }
    }
  });
}
