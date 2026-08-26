import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { APP_VERSION } from '@/lib/app-version';

/**
 * Stale-build guard.
 *
 * Two independent detectors:
 *   1. Service worker lifecycle — activates a waiting worker and reloads once
 *      a new worker takes control.
 *   2. Build-version polling — compares the version embedded in this bundle
 *      against `/version.json` (emitted at build time, fetched with
 *      `cache: "no-store"`). This catches the case where the service worker
 *      already took control with an old bundle, so nothing else would ever
 *      prompt an update.
 *
 * When a mismatch is detected we show the "Actualizar" pill; if the user
 * ignores it, we reload automatically the next time the tab regains focus.
 */
const POLL_MS = 5 * 60_000;

async function fetchDeployedVersion(): Promise<string | null> {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const json = (await res.json()) as { version?: unknown };
    return typeof json.version === 'string' ? json.version : null;
  } catch {
    return null;
  }
}

export default function NewVersionPrompt() {
  const [updateReady, setUpdateReady] = useState(false);
  const staleRef = useRef(false);

  // ---- Detector 2: build-version polling -----------------------------------
  useEffect(() => {
    if (APP_VERSION === 'dev') return;
    let cancelled = false;

    const check = async () => {
      const deployed = await fetchDeployedVersion();
      if (cancelled || !deployed) return;
      if (deployed !== APP_VERSION) {
        staleRef.current = true;
        setUpdateReady(true);
      }
    };

    void check();
    const timer = window.setInterval(() => void check(), POLL_MS);

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      // Already known to be stale and the user never acted → refresh now.
      if (staleRef.current) {
        window.location.reload();
        return;
      }
      void check();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // ---- Detector 1: service worker lifecycle (unchanged behaviour) ----------
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    let reloaded = false;

    const onControllerChange = () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    let cleanupVisibility: (() => void) | undefined;

    void navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) return;
      if (reg.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        setUpdateReady(true);
      }
      reg.addEventListener('updatefound', () => {
        const next = reg.installing;
        next?.addEventListener('statechange', () => {
          if (next.state === 'installed' && navigator.serviceWorker.controller) {
            setUpdateReady(true);
          }
        });
      });
      // Check for a newer build when the tab comes back to the foreground.
      const onVisible = () => {
        if (document.visibilityState === 'visible') void reg.update().catch(() => {});
      };
      document.addEventListener('visibilitychange', onVisible);
      cleanupVisibility = () => document.removeEventListener('visibilitychange', onVisible);
    });

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      cleanupVisibility?.();
    };
  }, []);

  if (!updateReady) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[60] -translate-x-1/2">
      <button
        onClick={() => window.location.reload()}
        className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg"
      >
        <RefreshCw className="h-4 w-4" /> Hay una versión nueva — Actualizar
      </button>
    </div>
  );
}
