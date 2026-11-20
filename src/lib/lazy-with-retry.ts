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
 *   2. if it still fails, unregister the app worker + clear shell caches and
 *      hard-reload once per session (guarded by sessionStorage so we can
 *      never end up in a reload loop),
 *   3. only if the reload already happened do we surface the error.
 */
import { lazy, type ComponentType } from 'react';
import { logClientEvent } from '@/lib/client-log';
import { refreshAppDocument } from '@/lib/app-shell-refresh';

const RELOAD_FLAG = 'homie_chunk_reload_at';
const RELOAD_COOLDOWN_MS = 60_000;
let lastReloadAt = 0;

const CHUNK_ERROR_RE =
  /(dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk)/i;

const isOfflineNow = () => typeof navigator !== 'undefined' && navigator.onLine === false;

/** Resolves when the device reports it is back online. */
function waitForOnline(): Promise<void> {
  if (!isOfflineNow()) return Promise.resolve();
  return new Promise((r) => window.addEventListener('online', () => r(), { once: true }));
}

export function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err ?? '');
  return CHUNK_ERROR_RE.test(msg);
}

/** True when a recovery reload already happened recently (avoids loops). */
function reloadedRecently(): boolean {
  if (lastReloadAt && Date.now() - lastReloadAt < RELOAD_COOLDOWN_MS) return true;
  try {
    const raw = sessionStorage.getItem(RELOAD_FLAG);
    if (!raw) return false;
    return Date.now() - Number(raw) < RELOAD_COOLDOWN_MS;
  } catch {
    return false;
  }
}

function markReloaded(): void {
  lastReloadAt = Date.now();
  try {
    sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
  } catch {
    /* private mode — worst case we reload twice */
  }
}

/** Recovers from a stale build by clearing caches and reloading once. */
export async function recoverFromStaleBuild(reason: string): Promise<boolean> {
  // Without signal a failed load is not a stale build: clearing the offline
  // copy and reloading would leave the receptor on a blank screen.
  if (isOfflineNow()) {
    logClientEvent({ kind: 'chunk_load_failed', message: reason, context: { action: 'offline_skip_reload' } });
    return false;
  }
  if (reloadedRecently()) return false;
  markReloaded();
  logClientEvent({ kind: 'chunk_load_failed', message: reason, context: { action: 'reload' } });
  await refreshAppDocument(String(Date.now()));
  return true;
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
        if (isOfflineNow()) {
          logClientEvent({ kind: 'chunk_load_failed', message: `${name}: ${String((err as Error)?.message ?? err)}`, context: { action: 'offline_wait' } });
          // Wait for signal and try again instead of reloading into nothing.
          await waitForOnline();
          return await factory();
        }
        if (isChunkLoadError(err)) {
          const refreshing = await recoverFromStaleBuild(`${name}: ${String((err as Error)?.message ?? err)}`);
          // Keep the promise pending while the page reloads, so React does not
          // flash an error screen during navigation away.
          if (!refreshing) throw err;
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
