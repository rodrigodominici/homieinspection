import { beforeEach, describe, it, expect } from 'vitest';
const id='c0000000-0000-4000-8000-000000000001';
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
const local=Boolean(key) && ['127.0.0.1','localhost'].includes(process.env.PGHOST ?? '');
async function api(path: string, method='GET', body?: unknown) {
  const response=await fetch(`http://127.0.0.1:8001/rest/v1/${path}`,{method,headers:{apikey:key ?? '',Authorization:`Bearer ${key ?? ''}`,'Content-Type':'application/json',Prefer:'return=representation'},body:body===undefined?undefined:JSON.stringify(body)});
  if(!response.ok) throw new Error(`Local test request failed: ${response.status}`);
  const text=await response.text(); return text?JSON.parse(text):null;
}
async function enqueue(type='inspection.status_changed') { return api('rpc/rm_enqueue','POST',{p_inspection_id:id,p_event_type:type}); }
async function rows() { return api(`rent_manager_outbox?inspection_id=eq.${id}&order=created_at.asc,id.asc`); }
describe.skipIf(!local)('Rent Manager isolated database rules',()=>{
  beforeEach(async()=>{
    await api(`inspection_external_references?inspection_id=eq.${id}`,'PATCH',{is_active:false});
    await api(`inspections?id=eq.${id}`,'PATCH',{status:'pending_assignment',market:'CL',inspector_id:null,executive_id:null});
    await api(`inspection_work_orders?inspection_id=eq.${id}`,'DELETE');
    await api(`rent_manager_outbox?inspection_id=eq.${id}`,'DELETE');
    await api(`inspection_external_references?inspection_id=eq.${id}`,'PATCH',{is_active:true});
  });
  it('only enqueues active CL captacion references',async()=>{
    await api(`inspection_external_references?inspection_id=eq.${id}`,'PATCH',{is_active:false});
    await api(`inspections?id=eq.${id}`,'PATCH',{status:'in_progress'});
    expect(await rows()).toHaveLength(0);
    await api(`inspection_external_references?inspection_id=eq.${id}`,'PATCH',{is_active:true});
    await api(`inspections?id=eq.${id}`,'PATCH',{market:'MX',status:'submitted'});
    expect(await rows()).toHaveLength(0);
  });
  it('uses exact RM IDs and never sends HI ID as inspection_id',async()=>{
    await enqueue();
    expect((await rows())[0].payload).toMatchObject({inspection_id:'rm-insp-avisos',external_object_id:'rm-inm-avisos',source:'homie_inspection'});
  });
  it('claims only oldest and blocks later events during retry',async()=>{
    await enqueue(); await enqueue('inspection.owner_feedback');
    const claimed=await api('rpc/rm_claim_outbox','POST',{p_limit:20});
    expect(claimed.filter((r:any)=>r.inspection_id===id)).toHaveLength(1);
    await api(`rent_manager_outbox?inspection_id=eq.${id}&status=eq.sending`,'PATCH',{status:'error',next_attempt_at:new Date(Date.now()+60000).toISOString()});
    expect((await api('rpc/rm_claim_outbox','POST',{p_limit:20})).filter((r:any)=>r.inspection_id===id)).toHaveLength(0);
  });
  it('recovers sending after five minutes and preserves event_id',async()=>{
    await enqueue(); const original=(await rows())[0];
    await api(`rent_manager_outbox?id=eq.${original.id}`,'PATCH',{status:'sending',sending_at:new Date(Date.now()-360000).toISOString()});
    const claimed=await api('rpc/rm_claim_outbox','POST',{p_limit:20});
    expect(claimed.find((r:any)=>r.id===original.id)?.event_id).toBe(original.event_id);
  });
  for(const status of [500,503,'network',400,401,404]) it(`persists simulated ${status} without sending real events`,async()=>{
    await enqueue(); await enqueue('inspection.owner_feedback');
    const original=(await rows())[0];
    const response=await fetch('http://127.0.0.1:8001/functions/v1/rent-manager-dispatch',{method:'POST',headers:{Authorization:`Bearer ${key ?? ''}`,'Content-Type':'application/json'},body:JSON.stringify({simulate:true,simulation_status:status})});
    expect(response.status).toBe(200);
    const result=(await rows())[0];
    expect(result.event_id).toBe(original.event_id);
    expect(result.simulated_status).toBe('error');
    expect(result.simulated_attempts).toBe(1);
    expect(result.simulated_last_error).toBeTruthy();
    expect(result.status).toBe('pending'); expect(result.attempts).toBe(0);
    if([500,503,'network'].includes(status)) expect(Date.parse(result.simulated_next_attempt_at)-Date.parse(result.simulated_at)).toBeGreaterThan(59000);
    else expect(result.simulated_next_attempt_at).toBeNull();
    expect((await api('rpc/rm_claim_simulated','POST',{p_limit:100})).filter((r:any)=>r.inspection_id===id)).toHaveLength(0);
  });
  it('recovers simulated sending older than 5 min but not newer',async()=>{
    await enqueue(); const original=(await rows())[0];
    await api(`rent_manager_outbox?id=eq.${original.id}`,'PATCH',{simulated_status:'sending',simulated_sending_at:new Date(Date.now()-240000).toISOString()});
    expect((await api('rpc/rm_claim_simulated','POST',{p_limit:100})).filter((r:any)=>r.inspection_id===id)).toHaveLength(0);
    await api(`rent_manager_outbox?id=eq.${original.id}`,'PATCH',{simulated_sending_at:new Date(Date.now()-360000).toISOString()});
    expect((await api('rpc/rm_claim_simulated','POST',{p_limit:100})).find((r:any)=>r.id===original.id)?.event_id).toBe(original.event_id);
  });
  it('retries with stable event_id then releases next event after simulated success',async()=>{
    await enqueue(); await enqueue('inspection.owner_feedback'); const original=(await rows())[0];
    await api(`rent_manager_outbox?id=eq.${original.id}`,'PATCH',{simulated_status:'error',simulated_next_attempt_at:new Date(Date.now()-1000).toISOString(),simulated_attempts:1});
    const response=await fetch('http://127.0.0.1:8001/functions/v1/rent-manager-dispatch',{method:'POST',headers:{Authorization:`Bearer ${key ?? ''}`,'Content-Type':'application/json'},body:JSON.stringify({simulate:true})});
    expect(response.status).toBe(200);
    const delivered=await rows(); expect(delivered.map((r:any)=>r.simulated_status)).toEqual(['sent','sent']);
    expect(delivered[0].simulated_payload.event_id).toBe(original.event_id); expect(delivered[0].simulated_attempts).toBe(2);
    expect(delivered.every((r:any)=>r.status==='pending')).toBe(true);
  });
  it('maps approved work and administration keys exactly',async()=>{
    await api('inspection_work_orders','POST',{inspection_id:id,contractor_id:'c0000000-0000-4000-8000-000000000003',status:'approved',keys_status:'administracion',keys_lock_number:'17'});
    expect((await rows()).find((r:any)=>r.event_type==='inspection.work_order_updated')?.payload.data).toMatchObject({estado:'terminada',keys_location:'administracion_edificio',lockbox_number:'17'});
  });
  it('leaves events untouched when real dispatch has no destination',async()=>{
    await enqueue(); const before=await rows();
    const response=await fetch('http://127.0.0.1:8001/functions/v1/rent-manager-dispatch',{method:'POST',headers:{Authorization:`Bearer ${key ?? ''}`,'Content-Type':'application/json'},body:'{}'});
    expect(response.status).toBe(200); expect((await response.json()).sent).toBe(0);
    expect(await rows()).toEqual(before);
  });
  it('rejects non-admin queue reads through RLS',async()=>{
    await enqueue();
    const auth=await fetch('http://127.0.0.1:8001/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:key ?? '', 'Content-Type':'application/json'},body:JSON.stringify({email:'receptor.prueba@homie.test',password:'PruebaRM-2026!'})});
    const session=await auth.json();
    expect(auth.status).toBe(200);
    const response=await fetch('http://127.0.0.1:8001/rest/v1/rent_manager_outbox',{headers:{apikey:key ?? '',Authorization:`Bearer ${session.access_token}`}});
    expect(response.status).toBe(200); expect(await response.json()).toEqual([]);
  });
});