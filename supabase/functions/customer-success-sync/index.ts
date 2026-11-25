import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { resolveCustomerSuccessSource, normalizeLabel } from './resolve.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TOKEN = Deno.env.get('HUBSPOT_PRIVATE_APP_TOKEN');
const HS = 'https://api.hubapi.com';
const CONTRACT_TYPE = '2-47492934';

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

async function hs(path: string, init: RequestInit = {}) {
  const res = await fetch(`${HS}${path}`, { ...init, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' } });
  const text = await res.text();
  let body: any = null; try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) throw new Error(`[${res.status}] ${path}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  return body;
}

let contractProp: { name: string; type: string; options: Record<string, string> } | null = null;
async function getContractProp(label: string) {
  if (contractProp) return contractProp;
  const all = await hs(`/crm/v3/properties/${CONTRACT_TYPE}`);
  const p = (all.results ?? []).find((x: any) => normalizeLabel(x.label) === normalizeLabel(label));
  if (!p) throw new Error(`contract_property_not_found:${label}`);
  const options: Record<string, string> = {};
  for (const o of p.options ?? []) options[o.value] = o.label;
  contractProp = { name: p.name, type: p.fieldType ?? p.type, options };
  return contractProp;
}

let finPipelines: Set<string> | null = null;
async function getFinPipelines(label: string) {
  if (finPipelines) return finPipelines;
  const all = await hs(`/crm/v3/pipelines/tickets`);
  finPipelines = new Set((all.results ?? []).filter((p: any) => normalizeLabel(p.label).includes(normalizeLabel(label))).map((p: any) => p.id));
  if (!finPipelines.size) throw new Error(`ticket_pipeline_not_found:${label}`);
  return finPipelines;
}

const ownerCache = new Map<string, { email: string | null; name: string | null }>();
async function owner(id: string) {
  if (ownerCache.has(id)) return ownerCache.get(id)!;
  let o = { email: null as string | null, name: null as string | null };
  try {
    const r = await hs(`/crm/v3/owners/${encodeURIComponent(id)}`);
    o = { email: r.email ?? null, name: [r.firstName, r.lastName].filter(Boolean).join(' ') || r.email || null };
  } catch { /* unknown owner */ }
  ownerCache.set(id, o);
  return o;
}

function numericId(raw: string) { const m = raw.match(/(\d+)$/); return m ? m[1] : null; }

async function resolveFor(insp: any, ref: any) {
  const src = resolveCustomerSuccessSource(insp.market);
  if (!src || !ref) return null;
  const id = numericId(ref.external_object_id);
  if (!id) return null;
  if (src.kind === 'contract_property') {
    if (ref.external_object_type !== 'lease_contract') return null;
    const p = await getContractProp(src.label);
    const r = await hs(`/crm/v3/objects/${CONTRACT_TYPE}/${id}?properties=${p.name}`);
    const v = r.properties?.[p.name];
    if (!v) return { email: null, name: null };
    if (/^\d+$/.test(String(v)) && !p.options[v]) return owner(String(v));
    return { email: null, name: p.options[v] ?? String(v) };
  }
  const pipes = await getFinPipelines(src.pipelineLabel);
  const objType = ref.external_object_type === 'deal' ? 'deals' : ref.external_object_type_id;
  const a = await hs(`/crm/v3/objects/${objType}/${id}/associations/tickets`);
  const ids = (a.results ?? []).map((x: any) => x.id ?? x.toObjectId).filter(Boolean);
  if (!ids.length) return { email: null, name: null };
  const b = await hs(`/crm/v3/objects/tickets/batch/read`, { method: 'POST', body: JSON.stringify({ inputs: ids.map((i: string) => ({ id: String(i) })), properties: ['hs_pipeline', 'hubspot_owner_id', 'createdate'] }) });
  const t = (b.results ?? []).filter((x: any) => pipes.has(x.properties?.hs_pipeline) && x.properties?.hubspot_owner_id)
    .sort((x: any, y: any) => String(y.properties.createdate).localeCompare(String(x.properties.createdate)))[0];
  if (!t) return { email: null, name: null };
  return owner(t.properties.hubspot_owner_id);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (!TOKEN) return json({ error: 'hubspot_not_configured' }, 500);
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const auth = req.headers.get('Authorization') ?? '';
  const isService = auth === `Bearer ${SERVICE_KEY}`;
  if (!isService) {
    const { data: u } = await admin.auth.getUser(auth.replace('Bearer ', ''));
    if (!u?.user) return json({ error: 'unauthorized' }, 401);
    const { data: p } = await admin.from('profiles').select('role,is_active').eq('id', u.user.id).single();
    if (!p?.is_active || !['admin', 'executive'].includes(p.role)) return json({ error: 'forbidden' }, 403);
  }
  const body = await req.json().catch(() => ({}));
  let q = admin.from('inspections').select('id, market, inspection_type').in('inspection_type', ['check_out', 'captacion']).in('market', ['CL', 'MX']);
  if (body.inspection_id) q = q.eq('id', body.inspection_id);
  else { if (body.only_missing !== false) q = q.is('customer_success_synced_at', null); q = q.limit(Math.min(body.limit ?? 50, 200)); }
  const { data: insps, error } = await q;
  if (error) return json({ error: error.message }, 500);
  const out: any[] = [];
  for (const insp of insps ?? []) {
    try {
      const { data: ref } = await admin.from('inspection_external_references').select('*').eq('inspection_id', insp.id).eq('provider', 'hubspot').eq('is_active', true).maybeSingle();
      const r = await resolveFor(insp, ref);
      let profileId: string | null = null;
      if (r?.email) {
        const { data: pr } = await admin.from('profiles').select('id').ilike('email', r.email).maybeSingle();
        profileId = pr?.id ?? null;
      }
      await admin.from('inspections').update({ customer_success_name: r?.name ?? null, customer_success_email: r?.email ?? null, customer_success_profile_id: profileId, customer_success_synced_at: new Date().toISOString() }).eq('id', insp.id);
      out.push({ id: insp.id, market: insp.market, ...r, profileId });
    } catch (e) {
      out.push({ id: insp.id, market: insp.market, error: String((e as Error).message).slice(0, 300) });
    }
  }
  return json({ count: out.length, results: out });
});
