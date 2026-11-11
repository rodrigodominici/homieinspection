import { beforeAll, describe, expect, it } from 'vitest';
const local = ['127.0.0.1','localhost'].includes(process.env.PGHOST ?? '') && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
const root = 'http://127.0.0.1:8001';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const id = 'd0000000-0000-4000-8000-000000000001';
let inspector = '', executive = '', replacement = '';
async function api(path: string, body?: unknown, token = key, method = body === undefined ? 'GET' : 'POST') {
  const response = await fetch(`${root}/rest/v1/${path}`, { method, headers: { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type':'application/json', Prefer:'return=representation' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  return { response, data: text ? JSON.parse(text) : null };
}
async function login(email: string) {
  const response = await fetch(`${root}/auth/v1/token?grant_type=password`, { method:'POST', headers:{apikey:key,'Content-Type':'application/json'}, body:JSON.stringify({email,password:'PruebaRM-2026!'}) });
  if (!response.ok) throw new Error('Test login failed');
  return (await response.json()).access_token as string;
}
describe.skipIf(!local)('Rent Manager Part 3 isolated rules', () => {
  beforeAll(async () => {
    inspector = await login('receptor.prueba@homie.test'); executive = await login('ejecutivo.prueba@homie.test');
    const { data } = await api(`inspections?id=eq.${id}&select=rm_rescheduled_to`);
    if (data[0]?.rm_rescheduled_to) {
      await api(`inspection_external_references?inspection_id=eq.${data[0].rm_rescheduled_to}`,{},key,'DELETE');
      await api(`inspections?id=eq.${id}`,{rm_rescheduled_to:null},key,'PATCH');
      await api(`inspections?id=eq.${data[0].rm_rescheduled_to}`,{},key,'DELETE');
      await api(`inspection_external_references?inspection_id=eq.${id}`,{is_active:true},key,'PATCH');
    }
    await api(`inspections?id=eq.${id}`,{status:'assigned',property_overrides_json:{},rm_availability_choice:null,rm_visit_date:null,rm_available_from:null,rm_reschedule_reason:null},key,'PATCH');
    await api(`inspection_sections?inspection_id=eq.${id}`,{status:'not_started'},key,'PATCH');
    await api(`rent_manager_outbox?inspection_id=eq.${id}`,{},key,'DELETE');
  });
  it('requires a valid inspector choice', async () => {
    const { response } = await api('rpc/rm_save_visit_availability',{p_id:id,p_choice:'otro',p_visit_date:'2026-11-06'},inspector);
    expect(response.ok).toBe(false);
  });
  it('does not let an inspector move executive availability', async () => {
    expect((await api('rpc/rm_move_availability',{p_id:id,p_date:'2026-11-12'},inspector)).response.ok).toBe(false);
  });
  it('five calendar days produce November 11 and gate the photo event until completion', async () => {
    expect((await api('rpc/rm_save_visit_availability',{p_id:id,p_choice:'en_5_dias',p_visit_date:'2026-11-06'},inspector)).response.ok).toBe(true);
    expect((await api(`inspections?id=eq.${id}&select=rm_available_from`)).data[0].rm_available_from).toBe('2026-11-11');
    expect((await api(`rent_manager_outbox?inspection_id=eq.${id}&event_type=eq.inspection.commercial_photos_ready`)).data).toHaveLength(0);
    await api(`inspection_sections?inspection_id=eq.${id}`,{status:'completed'},inspector,'PATCH');
    const events = (await api(`rent_manager_outbox?inspection_id=eq.${id}&event_type=eq.inspection.commercial_photos_ready`)).data;
    expect(events).toHaveLength(1); expect(events[0].payload.data).toMatchObject({disponibilidad:'en_5_dias',fecha_visita:'2026-11-06'}); expect(events[0].photo_objects).toHaveLength(10);
  });
  it('executive date move persists history and exact outgoing fields', async () => {
    expect((await api('rpc/rm_move_availability',{p_id:id,p_date:'2026-11-12',p_reason:'Coordinación de ejemplo'},executive)).response.ok).toBe(true);
    const events = (await api(`rent_manager_outbox?inspection_id=eq.${id}&event_type=eq.inspection.availability_updated`)).data;
    expect(events[0].payload.data).toEqual({disponible_desde:'2026-11-12',motivo:'Coordinación de ejemplo'});
    expect((await api(`rent_manager_availability_history?inspection_id=eq.${id}&order=created_at.desc`,undefined,executive)).data[0].available_from).toBe('2026-11-12');
  });
  it('key collection changes enqueue exact contract date', async () => {
    await api(`inspections?id=eq.${id}`,{property_overrides_json:{fecha_recoleccion_llaves:'2026-11-10'}},inspector,'PATCH');
    expect((await api(`rent_manager_outbox?inspection_id=eq.${id}&event_type=eq.inspection.keys_collection_scheduled`)).data[0].payload.data).toEqual({fecha_de_recoleccion_de_llaves:'2026-11-10'});
  });
  it('rescheduling requires both new date and reason', async () => {
    expect((await api('rpc/rm_reschedule_inspection',{p_id:id,p_date:'2026-11-13',p_reason:''},inspector)).response.ok).toBe(false);
  });
  it('preserves photos, closes the old inspection and creates assigned empty replacement', async () => {
    const result = await api('rpc/rm_reschedule_inspection',{p_id:id,p_date:'2026-11-13',p_reason:'Inmueble no preparado'},inspector);
    expect(result.response.ok).toBe(true); replacement = result.data;
    const old = (await api(`inspections?id=eq.${id}`)).data[0], next = (await api(`inspections?id=eq.${replacement}`)).data[0];
    expect(old.status).toBe('sent'); expect(old.rm_reschedule_reason).toBe('Inmueble no preparado');
    expect(next).toMatchObject({property_id:'rm-inm-visita',status:'assigned',inspector_id:'a0000000-0000-4000-8000-000000000003',executive_id:'a0000000-0000-4000-8000-000000000002'});
    expect(next.scheduled_at.slice(0,10)).toBe('2026-11-13');
    expect((await api(`inspection_photos?inspection_id=eq.${id}`)).data).toHaveLength(10);
    expect((await api(`inspection_photos?inspection_id=eq.${replacement}`)).data).toHaveLength(0);
    expect((await api(`inspection_external_references?inspection_id=eq.${replacement}`)).data[0].metadata.rm_inspection_id).toBe(replacement);
    const events = (await api(`rent_manager_outbox?inspection_id=eq.${id}&event_type=eq.inspection.rescheduled`)).data;
    expect(events).toHaveLength(1); expect(events[0].payload.data).toEqual({nueva_fecha:'2026-11-13',nuevo_id:replacement,motivo:'Inmueble no preparado'});
    expect((await api(`rent_manager_outbox?inspection_id=eq.${id}&event_type=eq.inspection.finalized`)).data).toHaveLength(0);
  });
  it('repeated reschedule returns the same replacement', async () => {
    const result = await api('rpc/rm_reschedule_inspection',{p_id:id,p_date:'2026-11-13',p_reason:'Inmueble no preparado'},inspector);
    expect(result.response.ok).toBe(true); expect(result.data).toBe(replacement);
  });
});