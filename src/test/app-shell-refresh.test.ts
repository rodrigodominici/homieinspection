import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearAppShellCaches, refreshAppDocument } from '@/lib/app-shell-refresh';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

function browserState() {
  const deleteCache = vi.fn().mockResolvedValue(true);
  const unregisterApp = vi.fn().mockResolvedValue(true);
  const unregisterPush = vi.fn().mockResolvedValue(true);
  const replace = vi.fn();
  vi.stubGlobal('window', {
    location: { origin: 'https://app.inspection.homie.mx', href: 'https://app.inspection.homie.mx/admin/properties/RE123?market=CL', replace },
    caches: {
      keys: vi.fn().mockResolvedValue(['homie-assets', 'homie-pages', 'homie-api', 'push-cache',
        'workbox-precache-v2-https://app.inspection.homie.mx/', 'workbox-precache-v2-https://other.example/']),
      delete: deleteCache,
    },
  });
  vi.stubGlobal('navigator', { serviceWorker: { getRegistrations: vi.fn().mockResolvedValue([
    { active: { scriptURL: 'https://app.inspection.homie.mx/sw.js' }, unregister: unregisterApp },
    { active: { scriptURL: 'https://app.inspection.homie.mx/firebase-messaging-sw.js' }, unregister: unregisterPush },
  ]) } });
  return { deleteCache, unregisterApp, unregisterPush, replace };
}

describe('app shell recovery', () => {
  it('preserves offline API and messaging caches and workers', async () => {
    const state = browserState();
    await clearAppShellCaches();
    expect(state.deleteCache.mock.calls.map(([name]) => name)).toEqual([
      'homie-assets', 'homie-pages', 'workbox-precache-v2-https://app.inspection.homie.mx/',
    ]);
    expect(state.unregisterApp).toHaveBeenCalledOnce();
    expect(state.unregisterPush).not.toHaveBeenCalled();
  });
  it('reloads the current property with a fresh document while preserving its filters', async () => {
    const { replace } = browserState();
    await refreshAppDocument('new-build');
    expect(replace).toHaveBeenCalledWith('https://app.inspection.homie.mx/admin/properties/RE123?market=CL&v=new-build');
  });
  it('does not hang when the browser cache operation stalls', async () => {
    vi.useFakeTimers();
    const { replace } = browserState();
    vi.mocked(window.caches.keys).mockImplementation(() => new Promise(() => {}));
    const refresh = refreshAppDocument('new-build');
    await vi.advanceTimersByTimeAsync(2_000);
    await refresh;
    expect(replace).toHaveBeenCalledOnce();
  });
  it('still refreshes when cache access is rejected', async () => {
    const { replace } = browserState();
    vi.mocked(window.caches.keys).mockRejectedValue(new Error('cache unavailable'));
    await refreshAppDocument('new-build');
    expect(replace).toHaveBeenCalledOnce();
  });
});