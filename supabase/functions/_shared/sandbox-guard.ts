// Test-backend guard: when functions run against a local draft backend, outbound
// calls to Slack, HubSpot and the realty APIs are simulated instead of sent.
// Production (hosted SUPABASE_URL) is unaffected.
const SIMULATED_HOSTS = ['api.hubapi.com', 'api.homierent.com'];
const SIMULATED_PATH_PREFIXES = ['https://connector-gateway.lovable.dev/slack/'];

export function isSandboxBackend(url = Deno.env.get('SUPABASE_URL') ?? ''): boolean {
  if (Deno.env.get('INTEGRATIONS_MODE') === 'simulate') return true;
  try {
    const host = new URL(url).hostname;
    return host === '127.0.0.1' || host === 'localhost';
  } catch {
    return false;
  }
}

export function shouldSimulate(target: string): boolean {
  if (SIMULATED_PATH_PREFIXES.some((p) => target.startsWith(p))) return true;
  try {
    return SIMULATED_HOSTS.includes(new URL(target).hostname);
  } catch {
    return false;
  }
}

if (isSandboxBackend() && !(globalThis as any).__sandboxGuardInstalled) {
  (globalThis as any).__sandboxGuardInstalled = true;
  const realFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const target = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (shouldSimulate(target)) {
      console.log(`[sandbox] simulated outbound call: ${init?.method ?? 'GET'} ${target.split('?')[0]}`);
      const isRealty = target.includes('api.homierent.com');
      return new Response(
        JSON.stringify(isRealty ? { error: 'simulated_in_test_environment' } : { ok: true, simulated: true, ts: 'simulated', properties: {} }),
        { status: isRealty ? 503 : 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return realFetch(input as any, init);
  }) as typeof fetch;
}
