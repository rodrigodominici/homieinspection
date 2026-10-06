import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { APP_VERSION } from '@/lib/app-version';

/**
 * Stale-build guard (no app-shell service worker anymore).
 * Compares the bundle version with `/version.json`. "Actualizar" drops any
 * leftover service worker + caches and reloads with a cache-bust. A per-version
 * flag in sessionStorage stops the pill from looping if the reload still
 * lands on the same old build.
 */
const POLL_MS = 5 * 60_000;
const FLAG = 'homie:update-attempt';

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

async function hardRefresh(target: string) {
  try {
    sessionStorage.setItem(FLAG, `${APP_VERSION}->${target}`);
  } catch { /* ignore */ }
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch { /* best effort */ }
  const url = new URL(window.location.href);
  url.searchParams.set('v', target || String(Date.now()));
  window.location.replace(url.toString());
}

export default function NewVersionPrompt() {
  const [deployed, setDeployed] = useState<string | null>(null);

  useEffect(() => {
    if (APP_VERSION === 'dev') return;
    let cancelled = false;
    const check = async () => {
      const v = await fetchDeployedVersion();
      if (cancelled || !v || v === APP_VERSION) return;
      let attempted: string | null = null;
      try { attempted = sessionStorage.getItem(FLAG); } catch { /* ignore */ }
      // Already tried this exact update and still on the old build: stop nagging.
      if (attempted === `${APP_VERSION}->${v}`) return;
      setDeployed(v);
    };
    void check();
    const timer = window.setInterval(() => void check(), POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  if (!deployed) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[60] -translate-x-1/2">
      <button
        onClick={() => void hardRefresh(deployed)}
        className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg"
      >
        <RefreshCw className="h-4 w-4" /> Hay una versión nueva — Actualizar
      </button>
    </div>
  );
}
