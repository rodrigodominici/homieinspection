import { describe, expect, it } from 'vitest';
// Corre contra la base aislada del borrador (igual que rent-manager-part3-database.test.ts).
const local = ['127.0.0.1','localhost'].includes(process.env.PGHOST ?? '') && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
const root = 'http://127.0.0.1:8001';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const testId = 'd0000000-0000-4000-8000-000000000001';
async function api(path: string, body?: unknown, token = key, method = body === undefined ? 'GET' : 'POST') {
  const r = await fetch(`${root}/rest/v1/${path}`, { method, headers: { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); return { r, data: t ? JSON.parse(t) : null };
}
async function login(email: string) {
  const r = await fetch(`${root}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'PruebaRM-2026!' }) });
  return (await r.json()).access_token as string;
}
const shape = (v: unknown): unknown => Array.isArray(v) ? 'array' : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, shape((v as Record<string, unknown>)[k])])) : typeof v;

describe.skipIf(!local)('Simulador Rent Manager', () => {
  it('rechaza una inspección real (is_test = false)', async () => {
    const admin = await login('admin.prueba@homie.test');
    await api(`inspections?id=eq.${testId}`, { is_test: false }, key, 'PATCH');
    const { r, data } = await api('rpc/rm_simulate_step', { p_id: testId, p_step: 'keys' }, admin);
    await api(`inspections?id=eq.${testId}`, { is_test: true }, key, 'PATCH');
    expect(r.ok).toBe(false); expect(data.message).toBe('simulator_test_rent_manager_only');
  });
  it('rechaza a un usuario que no es admin', async () => {
    const exec = await login('ejecutivo.prueba@homie.test');
    const { r, data } = await api('rpc/rm_simulate_step', { p_id: testId, p_step: 'keys' }, exec);
    expect(r.ok).toBe(false); expect(data.message).toBe('simulator_admin_required');
  });
  it('el evento simulado tiene la misma forma que uno real', async () => {
    const admin = await login('admin.prueba@homie.test');
    await api(`inspections?id=eq.${testId}`, { property_overrides_json: { fecha_recoleccion_llaves: '2026-01-01' } }, key, 'PATCH');
    const real = (await api(`rent_manager_outbox?inspection_id=eq.${testId}&event_type=eq.inspection.keys_collection_scheduled&order=created_at.desc&limit=1`)).data[0];
    expect((await api('rpc/rm_simulate_step', { p_id: testId, p_step: 'keys' }, admin)).r.ok).toBe(true);
    const sim = (await api(`rent_manager_outbox?inspection_id=eq.${testId}&event_type=eq.inspection.keys_collection_scheduled&order=created_at.desc&limit=1`)).data[0];
    expect(shape(sim.payload)).toEqual(shape(real.payload));
  });
});
