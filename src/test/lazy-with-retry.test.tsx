import React, { Suspense } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('@/lib/client-log', () => ({ logClientEvent: vi.fn() }));
vi.mock('@/lib/app-shell-refresh', () => ({ refreshAppDocument: vi.fn().mockResolvedValue(undefined) }));

beforeEach(() => { vi.resetModules(); sessionStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('stale route recovery', () => {
  it('does not reload or remove offline resources without connectivity', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const { recoverFromStaleBuild } = await import('@/lib/lazy-with-retry');
    const { refreshAppDocument } = await import('@/lib/app-shell-refresh');
    vi.mocked(refreshAppDocument).mockClear();
    expect(await recoverFromStaleBuild('Failed to fetch dynamically imported module')).toBe(false);
    expect(refreshAppDocument).not.toHaveBeenCalled();
  });
  it('starts only one automatic reload, including when session storage is unavailable', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const { recoverFromStaleBuild } = await import('@/lib/lazy-with-retry');
    expect(await recoverFromStaleBuild('Failed to fetch dynamically imported module')).toBe(true);
    expect(await recoverFromStaleBuild('Failed to fetch dynamically imported module')).toBe(false);
  });
  it('surfaces a persistent chunk failure instead of leaving an endless spinner after a recent reload', async () => {
    sessionStorage.setItem('homie_chunk_reload_at', String(Date.now()));
    const { lazyWithRetry } = await import('@/lib/lazy-with-retry');
    const error = new Error('Failed to fetch dynamically imported module');
    const factory = vi.fn().mockRejectedValue(error);
    const Screen = lazyWithRetry(factory, 'PropertyDetail');
    class Boundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
      state = { failed: false };
      static getDerivedStateFromError() { return { failed: true }; }
      render() { return this.state.failed ? <p>Recovered failure</p> : this.props.children; }
    }
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<Boundary><Suspense fallback={<p>Loading</p>}><Screen /></Suspense></Boundary>);
    expect(await screen.findByText('Recovered failure', {}, { timeout: 2_000 })).toBeInTheDocument();
    expect(factory).toHaveBeenCalledTimes(2);
  });
});