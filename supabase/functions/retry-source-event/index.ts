// Retry a failed inspection_source_events row.
// Admin-only. Refuses non-failed rows, payload_validation failures, and rows over the retry cap.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const RETRY_LIMIT = 5;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const { data: claims, error: claimsErr } = await userClient.auth.getClaims(auth.replace('Bearer ', ''));
  if (claimsErr || !claims?.claims?.sub) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const userId = claims.claims.sub;
  const { data: profile } = await admin.from('profiles').select('role,is_active').eq('id', userId).maybeSingle();
  if (!profile || profile.role !== 'admin' || !profile.is_active) {
    return new Response(JSON.stringify({ error: 'forbidden' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { event_id } = await req.json().catch(() => ({}));
  if (!event_id) {
    return new Response(JSON.stringify({ error: 'missing_event_id' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: row, error: rowErr } = await admin
    .from('inspection_source_events')
    .select('id, processing_status, failure_reason, retry_count, retry_attempts_json')
    .eq('id', event_id)
    .maybeSingle();

  if (rowErr || !row) {
    return new Response(JSON.stringify({ error: 'not_found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (row.processing_status !== 'failed') {
    return new Response(JSON.stringify({ error: 'only_failed_events_can_be_retried' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (row.failure_reason === 'payload_validation') {
    return new Response(JSON.stringify({ error: 'payload_validation_cannot_be_retried' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if ((row.retry_count ?? 0) >= RETRY_LIMIT) {
    return new Response(JSON.stringify({ error: 'retry_limit_reached', limit: RETRY_LIMIT }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const attempts = Array.isArray(row.retry_attempts_json) ? row.retry_attempts_json : [];

  await admin
    .from('inspection_source_events')
    .update({
      processing_status: 'processing',
      processing_started_at: new Date().toISOString(),
      retry_count: (row.retry_count ?? 0) + 1,
    })
    .eq('id', event_id);

  const { data: rpcResult, error: rpcError } = await admin.rpc('create_inspection_from_event', {
    p_event_id: event_id,
  });

  const result = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;
  const outcome = rpcError || result?.failure_reason ? 'failed' : 'completed';

  attempts.push({
    attempted_at: new Date().toISOString(),
    attempted_by: userId,
    previous_failure_reason: row.failure_reason,
    outcome,
    error: rpcError?.message ?? result?.error_detail ?? null,
  });

  await admin
    .from('inspection_source_events')
    .update({ retry_attempts_json: attempts })
    .eq('id', event_id);

  return new Response(
    JSON.stringify({ status: outcome, inspection_id: result?.inspection_id ?? null }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
