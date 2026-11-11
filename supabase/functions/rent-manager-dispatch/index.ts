import '../_shared/sandbox-guard.ts';
import { isSandboxBackend } from '../_shared/sandbox-guard.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { configured, deliveryResult, simulatedReceiver } from '../_shared/rent-manager-delivery.ts';
import { timingSafeEqual } from '../_shared/intake-source.ts';
import { publicAppOrigin, reportLinks, publicPhotoUrl } from '../_shared/rent-manager-links.ts';

const Body = z.object({ simulate: z.boolean().default(false), simulation_status: z.union([z.literal(200), z.literal(400), z.literal(401), z.literal(404), z.literal(500), z.literal(503), z.literal('network')]).default(200), origin: z.string().url().optional(), wake_id: z.string().uuid().optional() }).strict();
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return reply({});
  if (req.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const admin = createClient(url, key);
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return reply({ error: parsed.error.flatten() }, 400);
  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  let system = timingSafeEqual(bearer, key);
  if (!system && parsed.data.wake_id && !parsed.data.simulate) {
    const { data } = await admin.rpc('rm_consume_wake', { p_id: parsed.data.wake_id });
    system = data === true;
  }
  if (!system) {
    const { data: auth, error } = await admin.auth.getUser(bearer);
    if (error || !auth.user) return reply({ error: 'unauthorized' }, 401);
    const { data: p } = await admin.from('profiles').select('is_active,approval_status').eq('id', auth.user.id).maybeSingle();
    const { data: role } = await admin.rpc('has_role', { _user_id: auth.user.id, _role: 'admin' });
    if (!role || !p?.is_active || p.approval_status !== 'approved') return reply({ error: 'admin_required' }, 403);
  }
  const simulation = parsed.data.simulate;
  if (simulation && !isSandboxBackend()) return reply({ error: 'simulation_only_in_draft' }, 403);
  const target = Deno.env.get('RENT_MANAGER_WEBHOOK_URL');
  const secret = Deno.env.get('RENT_MANAGER_WEBHOOK_SECRET');
  if (!simulation && (!configured(target, secret) || isSandboxBackend())) return reply({ status: 'pending', reason: isSandboxBackend() ? 'draft_external_delivery_disabled' : 'not_configured', sent: 0 });
  try {
    async function prepare(row: any) {
      const payload = structuredClone(row.payload) as Record<string, any>;
      if (Array.isArray(row.photo_objects) && row.photo_objects.length) {
        payload.data.fotos = [];
        for (const photo of row.photo_objects) {
          if (photo.bucket !== 'inspection-photos') throw new Error('invalid_photo_bucket');
          const { data, error } = await admin.storage.from(photo.bucket).createSignedUrl(photo.path, 7 * 24 * 60 * 60);
          if (error || !data?.signedUrl) throw error ?? new Error('photo_signing_failed');
          payload.data.fotos.push(publicPhotoUrl(data.signedUrl, simulation));
        }
      }
      if (row.event_type === 'inspection.report_published') {
        const { data: i, error } = await admin.from('inspections').select('property_id').eq('id', row.inspection_id).single();
        if (error || !i?.property_id) throw error ?? new Error('missing_report_property');
        const origin = publicAppOrigin(Deno.env.get('PUBLIC_APP_URL'), simulation ? parsed.data.origin : undefined);
        Object.assign(payload.data, reportLinks(origin, row.inspection_id, i.property_id, row.report_tokens ?? {}));
      }
      return payload;
    }
    let sent = 0, errors = 0, simulated = 0;
    for (let round = 0; round < 20; round++) {
      const { data: rows, error } = await admin.rpc(simulation ? 'rm_claim_simulated' : 'rm_claim_outbox', { p_limit: 20 });
      if (error) throw error;
      if (!rows?.length) break;
      for (const row of rows) {
        let status: number | null = null;
        let responseBody: unknown = null;
        let failure: string | null = null;
        const payload = structuredClone(row.payload) as Record<string, any>;
        try {
          Object.assign(payload, await prepare(row));
          if (simulation) {
            if (parsed.data.simulation_status === 'network') throw new Error('simulated_network_error');
            const result = simulatedReceiver(payload, new Set<string>(), parsed.data.simulation_status);
            status = result.status; responseBody = result.body;
          } else {
            const { error: persistError } = await admin.from('rent_manager_outbox').update({ payload }).eq('id', row.id).eq('claim_id', row.claim_id);
            if (persistError) throw persistError;
            const response = await fetch(target ?? '', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': secret ?? '' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15000), redirect: 'error' });
            status = response.status;
            const text = await response.text();
            try { responseBody = JSON.parse(text); } catch { responseBody = text.slice(0, 4000); }
          }
          if (status !== 200) failure = typeof (responseBody as any)?.error === 'string' ? (responseBody as any).error : `HTTP ${status}`;
        } catch {
          failure = 'Error de conexión o preparación del envío';
        }
        const result = deliveryResult(status, simulation ? row.simulated_attempts : row.attempts);
        const changes = simulation ? { simulated_status: result.status, simulated_next_attempt_at: result.next_attempt_at, simulated_payload: payload, simulated_at: new Date().toISOString(), simulated_response_status: status, simulated_response: responseBody, simulated_last_error: failure, simulated_claim_id: null, simulated_sending_at: null } : { ...result, payload, response_status: status, response_body: responseBody, last_error: failure, sent_at: result.status === 'sent' ? new Date().toISOString() : null, claim_id: null, sending_at: null };
        const { error: saveError } = await admin.from('rent_manager_outbox').update(changes).eq('id', row.id).eq(simulation ? 'simulated_claim_id' : 'claim_id', simulation ? row.simulated_claim_id : row.claim_id);
        if (saveError) throw saveError;
        if (simulation) simulated++;
        if (result.status === 'sent') { if (!simulation) sent++; } else errors++;
      }
    }
    return reply(simulation ? { status: 'simulated', simulated, sent: 0, errors } : { sent, errors });
  } catch { return reply({ error: 'dispatch_failed' }, 500); }
});