/**
 * Single registration point for the offline app-shell worker (/sw.js).
 * Never registers in dev, iframes or Lovable preview hosts, or with ?sw=off;
 * in those contexts any existing /sw.js registration is removed.
 */
function refused(): boolean {
  if (!import.meta.env.PROD) return true;
  try { if (window.self !== window.top) return true; } catch { return true; }
  const h = window.location.hostname;
  if (h.startsWith('id-preview--') || h.startsWith('preview--')) return true;
  const hosts = ['lovableproject.com', 'lovableproject-dev.com', 'beta.lovable.dev'];
  if (hosts.some((d) => h === d || h.endsWith(`.${d}`))) return true;
  if (new URLSearchParams(window.location.search).get('sw') === 'off') return true;
  return false;
}

async function unregisterAppWorkers() {
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    regs
      .filter((r) => [r.active, r.waiting, r.installing].some((w) => w?.scriptURL.endsWith('/sw.js')))
      .map((r) => r.unregister()),
  );
}

export async function registerAppServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    if (refused()) { await unregisterAppWorkers(); return; }
    const { registerSW } = await import('virtual:pwa-register');
    registerSW({ immediate: true });
  } catch { /* best effort */ }
}
