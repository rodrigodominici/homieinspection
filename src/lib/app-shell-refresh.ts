/** Remove only this app's shell caches, never API data or other workers. */
export async function clearAppShellCaches(): Promise<void> {
  const scope = `${window.location.origin}/`;
  const tasks: Promise<unknown>[] = [];
  if ('serviceWorker' in navigator) {
    tasks.push(navigator.serviceWorker.getRegistrations().then((registrations) =>
      Promise.allSettled(registrations.filter((registration) =>
        [registration.active, registration.waiting, registration.installing].some((worker) => {
          if (!worker) return false;
          const url = new URL(worker.scriptURL);
          return url.origin === window.location.origin && url.pathname === '/sw.js';
        }),
      ).map((registration) => registration.unregister())),
    ));
  }
  if ('caches' in window) {
    tasks.push(window.caches.keys().then((keys) => Promise.allSettled(keys.filter((key) =>
      key === 'homie-assets' || key === 'homie-pages' ||
      (key.startsWith('workbox-precache-') && key.endsWith(scope)),
    ).map((key) => window.caches.delete(key)))));
  }
  // A stalled browser cache operation must not leave the route spinning forever.
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    Promise.allSettled(tasks),
    new Promise<void>((resolve) => { timer = setTimeout(resolve, 2_000); }),
  ]);
  if (timer !== undefined) clearTimeout(timer);
}

export async function refreshAppDocument(target: string): Promise<void> {
  await clearAppShellCaches();
  const url = new URL(window.location.href);
  url.searchParams.set('v', target);
  window.location.replace(url.toString());
}