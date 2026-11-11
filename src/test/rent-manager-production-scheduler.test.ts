import { describe, expect, it } from 'vitest';

// Explicit opt-in: creates only disposable is_test rows; never configures an outbound destination.
const enabled = process.env.VERIFY_RM_PRODUCTION_SCHEDULER === '1';
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
async function api(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') {
  if (!url || !key) throw new Error('Missing backend binding');
  const res = await fetch(`${url}/rest/v1/${path}`, {
    method, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Verification request failed: ${res.status}`);
  const text = await res.text(); return text ? JSON.parse(text) : null;
}
describe.skipIf(!enabled)('production Rent Manager scheduler isolation', () => {
  for (const [market, type, provider, accepted] of [
    ['CL', 'captacion', 'rent_manager', true],
    ['CL', 'captacion', 'hubspot', false],
    ['MX', 'captacion', 'rent_manager', false],
    ['CL', 'check_out', 'rent_manager', false],
  ] as const) it(`${market} ${type} ${provider}: enqueue=${accepted}`, async () => {
    const id = crypto.randomUUID();
    await api('inspections', { id, property_id: `verify-${id}`, market, inspection_type: type, property_type: 'departamento', property_name: 'PRUEBA AUTOMÁTICA DESPACHO RM', address: 'PRUEBA AUTOMÁTICA DESPACHO RM', status: 'pending_assignment', is_test: true });
    try {
      await api('inspection_external_references', { inspection_id: id, provider, external_object_type: 'captacion', external_object_id: `verify-${id}`, metadata: { rm_inspection_id: `verify-${id}` }, is_active: true });
      const event = await api('rpc/rm_enqueue', { p_inspection_id: id, p_event_type: 'inspection.status_changed' });
      expect(Boolean(event)).toBe(accepted);
      if (accepted) {
        const before = await api(`rent_manager_outbox?id=eq.${event}`);
        if (!url || !key) throw new Error('Missing backend binding');
        const result = await fetch(`${url}/functions/v1/rent-manager-dispatch`, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: '{}' });
        expect(result.status).toBe(200);
        expect(await result.json()).toMatchObject({ reason: 'not_configured', sent: 0 });
        expect(await api(`rent_manager_outbox?id=eq.${event}`)).toEqual(before);
      }
    } finally {
      await api(`inspections?id=eq.${id}&is_test=eq.true`, undefined, 'DELETE');
    }
  });
});