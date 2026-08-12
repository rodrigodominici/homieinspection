import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

/**
 * Stale-build guard.
 *
 * The service worker precaches the app shell, so a tab left open across a
 * deploy keeps running the old build and can break when it lazily loads a
 * screen whose chunk no longer exists. This component:
 *   - activates a waiting service worker immediately,
 *   - reloads once when a new worker takes control,
 *   - offers a manual "Actualizar" if the browser reports an update.
 */
export default function NewVersionPrompt() {
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    let reloaded = false;

    const onControllerChange = () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

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
      return () => document.removeEventListener('visibilitychange', onVisible);
    });

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
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
