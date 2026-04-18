// Recover events stuck in 'received' or 'processing' for more than 5 minutes.
// Admin-only. Re-invokes the RPC for each, capped per run.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const PER_RUN_CAP = 25;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
  const { data: claims } = await userClient.auth.getClaims(auth.replace('Bearer ', ''));
  if (!claims?.claims?.sub) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: profile } = await admin
    .from('profiles')
    .select('role,is_active')
    .eq('id', claims.claims.sub)
    .maybeSingle();
  if (!profile || profile.role !== 'admin' || !profile.is_active) {
    return new Response(JSON.stringify({ error: 'forbidden' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: stalled } = await admin
    .from('inspection_source_events')
    .select('id, recovery_count, processing_status')
    .in('processing_status', ['received', 'processing'])
    .lt('received_at', cutoff)
    .order('received_at', { ascending: true })
    .limit(PER_RUN_CAP);

  const results: any[] = [];
  for (const row of stalled ?? []) {
    await admin
      .from('inspection_source_events')
      .update({
        processing_status: 'processing',
        processing_started_at: new Date().toISOString(),
        recovery_count: (row.recovery_count ?? 0) + 1,
      })
      .eq('id', row.id);

    const { data: rpcResult, error: rpcErr } = await admin.rpc('create_inspection_from_event', {
      p_event_id: row.id,
    });
    const r = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;
    results.push({
      event_id: row.id,
      outcome: rpcErr || r?.failure_reason ? 'failed' : 'completed',
      error: rpcErr?.message ?? r?.error_detail ?? null,
    });
  }

  return new Response(JSON.stringify({ recovered: results.length, results }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
