// Kill-switch: replaces the old offline service worker, clears its caches,
// reloads open windows with the live build, then unregisters itself.
function isAppCache(name) {
  const workbox = /(^|-)precache-v\d+-|(^|-)runtime-|(^|-)googleAnalytics-/.test(name) && name.endsWith(self.registration.scope);
  return workbox || name === "supabase-edge" || name === "google-fonts";
}
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      try {
        const names = await caches.keys();
        await Promise.allSettled(names.filter(isAppCache).map((n) => caches.delete(n)));
        await self.clients.claim();
        const wins = await self.clients.matchAll({ type: "window" });
        await Promise.allSettled(wins.map((c) => c.navigate(c.url)));
      } finally {
        await self.registration.unregister();
      }
    })(),
  ),
);
