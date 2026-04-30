// Manual retry for outbound HubSpot sync log rows.
// Admin-only. Refuses non-error rows, non-retryable failures, and rows over the cap.
// Re-invokes `hubspot-update-inspection` so the canonical PATCH path stays
// the single source of truth — every retry produces a fresh log row.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
// Shared classifier — same vocabulary the UI uses, no drift.
import { classifyOutboundFailure } from '../../../src/lib/hubspot-retry-classifier.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const RETRY_LIMIT = 5;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  // ── In-code JWT validation (admin-only) ──
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return jsonResponse({ error: 'unauthorized' }, 401);

  const userClient = createClient(SUPABASE_URL, ANON_KEY);
  const { data: userData, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || !userData?.user?.id) return jsonResponse({ error: 'unauthorized' }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const userId = userData.user.id;

  const { data: profile } = await admin
    .from('profiles')
    .select('role,is_active')
    .eq('id', userId)
    .maybeSingle();
  if (!profile || profile.role !== 'admin' || !profile.is_active) {
    return jsonResponse({ error: 'forbidden' }, 403);
  }

  // ── Body ──
  let body: { log_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400);
  }
  const logId = body.log_id;
  if (!logId || typeof logId !== 'string') {
    return jsonResponse({ error: 'missing_log_id' }, 400);
  }

  // ── Load original log row ──
  const { data: row, error: rowErr } = await admin
    .from('hubspot_sync_log')
    .select('id, inspection_id, action, status, response_status, error_message, event_time, retry_count, retry_attempts_json')
    .eq('id', logId)
    .maybeSingle();
  if (rowErr || !row) return jsonResponse({ error: 'not_found' }, 404);

  // ── Refusal gates ──
  if (row.status !== 'error') {
    return jsonResponse({ error: 'only_error_rows_can_be_retried', current_status: row.status }, 400);
  }
  const klass = classifyOutboundFailure({
    status: row.status,
    response_status: row.response_status,
    error_message: row.error_message,
  });
  if (klass !== 'retryable') {
    return jsonResponse({
      error: 'non_retryable',
      reason: row.error_message ?? `http_${row.response_status ?? 'unknown'}`,
    }, 409);
  }
  if ((row.retry_count ?? 0) >= RETRY_LIMIT) {
    return jsonResponse({ error: 'retry_limit_reached', limit: RETRY_LIMIT }, 400);
  }
  if (!row.inspection_id || !row.action) {
    return jsonResponse({ error: 'incomplete_log_row' }, 409);
  }
  const action = row.action as 'key_collection_date' | 'checkout_received';
  if (action !== 'key_collection_date' && action !== 'checkout_received') {
    return jsonResponse({ error: 'unsupported_action', action: row.action }, 409);
  }

  // ── Resolve event_time per plan §3 ──
  let eventTime: string | null = row.event_time ?? null;
  let eventTimeSource: 'log_row' | 'inspection_completed_at_fallback' | 'not_required' =
    eventTime ? 'log_row' : 'not_required';

  if (action === 'checkout_received') {
    if (!eventTime) {
      const { data: insp } = await admin
        .from('inspections')
        .select('inspection_completed_at')
        .eq('id', row.inspection_id)
        .maybeSingle();
      if (insp?.inspection_completed_at) {
        eventTime = insp.inspection_completed_at as string;
        eventTimeSource = 'inspection_completed_at_fallback';
      } else {
        return jsonResponse({ error: 'missing_event_time_for_retry' }, 409);
      }
    }
  }

  // ── Append provisional attempt entry & bump counter on the ORIGINAL row ──
  const attempts = Array.isArray(row.retry_attempts_json) ? row.retry_attempts_json : [];
  const startedAt = new Date().toISOString();
  attempts.push({
    attempted_at: startedAt,
    attempted_by: userId,
    outcome: 'pending',
    new_log_id: null,
    event_time_source: eventTimeSource,
  });
  await admin
    .from('hubspot_sync_log')
    .update({ retry_count: (row.retry_count ?? 0) + 1, retry_attempts_json: attempts })
    .eq('id', logId);

  // ── Re-invoke the canonical PATCH function (forwarding admin's bearer) ──
  const invokeBody: Record<string, unknown> = {
    inspection_id: row.inspection_id,
    action,
    triggered_retry_from: logId,
  };
  if (action === 'checkout_received' && eventTime) invokeBody.event_time = eventTime;

  let invokeResp: Response | null = null;
  let invokeJson: { ok?: boolean; status?: string; log_id?: string } = {};
  try {
    invokeResp = await fetch(`${SUPABASE_URL}/functions/v1/hubspot-update-inspection`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: ANON_KEY,
      },
      body: JSON.stringify(invokeBody),
    });
    invokeJson = await invokeResp.json().catch(() => ({}));
  } catch (err) {
    // Network error invoking the inner function — finalize attempt as failed.
    const finalAttempts = [...attempts];
    finalAttempts[finalAttempts.length - 1] = {
      ...finalAttempts[finalAttempts.length - 1],
      outcome: 'failed',
      error: (err as Error).message,
    };
    await admin
      .from('hubspot_sync_log')
      .update({ retry_attempts_json: finalAttempts })
      .eq('id', logId);
    return jsonResponse({ error: 'invoke_failed', detail: (err as Error).message }, 502);
  }

  const newLogId = invokeJson.log_id ?? null;
  const innerStatus = invokeJson.status ?? (invokeJson.ok ? 'success' : 'error');
  const outcome: 'completed' | 'failed' = invokeJson.ok ? 'completed' : 'failed';

  // Finalize the attempt entry & persist the forward link.
  const finalAttempts = [...attempts];
  finalAttempts[finalAttempts.length - 1] = {
    ...finalAttempts[finalAttempts.length - 1],
    outcome,
    new_log_id: newLogId,
    new_status: innerStatus,
  };
  await admin
    .from('hubspot_sync_log')
    .update({ retry_attempts_json: finalAttempts, retried_to_log_id: newLogId })
    .eq('id', logId);

  return jsonResponse({
    ok: outcome === 'completed',
    status: outcome,
    new_log_id: newLogId,
    new_status: innerStatus,
  }, 200);
});
