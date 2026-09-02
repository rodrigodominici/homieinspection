// Inbound HubSpot → Homie Inspection sync for checkout date changes.
// Called by a dedicated HubSpot workflow that triggers on
// `fecha_de_termino_de_` property changes on Contrato de Locación objects.
//
// Finds the active checkout inspection for the property and updates
// scheduled_at. Skips gracefully when no inspection exists (e.g. the date
// changed before the creation workflow ran).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const INTAKE_SECRET = Deno.env.get('HUBSPOT_INTAKE_SECRET') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-webhook-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Statuses where updating the scheduled date still makes sense.
const UPDATABLE_STATUSES = ['pending', 'scheduled', 'in_progress', 'assigned'];

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // ── Auth ──
  const provided = req.headers.get('x-webhook-secret') ?? '';
  if (!INTAKE_SECRET || !timingSafeEqual(provided, INTAKE_SECRET)) {
    console.warn('[checkout-date-sync] rejected: invalid secret');
    return json({ error: 'unauthorized' }, 401);
  }

  // ── Parse ──
  let body: {
    property_id?: string;
    new_date?: string;
    external_object_id?: string;
    market?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const { property_id, new_date, external_object_id, market } = body;

  if (!property_id || typeof property_id !== 'string') {
    return json({ error: 'missing_property_id' }, 400);
  }
  if (!new_date || typeof new_date !== 'string') {
    return json({ error: 'missing_new_date' }, 400);
  }

  // HubSpot sends dates as "YYYY-MM-DD" or millisecond timestamps. Normalize.
  const parsedDate = isNaN(Number(new_date))
    ? new Date(new_date)
    : new Date(Number(new_date));

  if (isNaN(parsedDate.getTime())) {
    return json({ error: 'invalid_date', received: new_date }, 400);
  }
  const scheduledAt = parsedDate.toISOString();

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // ── Find the active checkout inspection for this property ──
  const { data: inspection, error: findErr } = await supabase
    .from('inspections')
    .select('id, status, scheduled_at, inspection_type')
    .eq('property_id', property_id)
    .eq('inspection_type', 'checkout')
    .in('status', UPDATABLE_STATUSES)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (findErr) {
    console.error('[checkout-date-sync] lookup failed', findErr);
    await logEvent(supabase, {
      event_type: 'checkout_date_updated',
      external_object_id: external_object_id ?? null,
      property_id,
      payload: body,
      status: 'failed',
      failure_reason: 'lookup_failed',
      error_message: findErr.message,
    });
    return json({ error: 'lookup_failed', detail: findErr.message }, 500);
  }

  if (!inspection) {
    console.info(`[checkout-date-sync] no active checkout inspection for property_id=${property_id}`);
    await logEvent(supabase, {
      event_type: 'checkout_date_updated',
      external_object_id: external_object_id ?? null,
      property_id,
      payload: body,
      status: 'skipped',
      failure_reason: 'no_active_inspection',
      error_message: `No active checkout inspection found for property_id=${property_id}`,
    });
    return json({ status: 'skipped', reason: 'no_active_inspection' }, 200);
  }

  // Skip if the date is already the same (idempotent guard).
  const currentDate = inspection.scheduled_at ? new Date(inspection.scheduled_at).toISOString() : null;
  if (currentDate === scheduledAt) {
    await logEvent(supabase, {
      event_type: 'checkout_date_updated',
      external_object_id: external_object_id ?? null,
      property_id,
      payload: body,
      status: 'skipped',
      failure_reason: 'date_unchanged',
      error_message: `scheduled_at already equals new_date (${scheduledAt})`,
      inspection_id: inspection.id,
    });
    return json({ status: 'skipped', reason: 'date_unchanged', inspection_id: inspection.id }, 200);
  }

  // ── Update scheduled_at ──
  const { error: updateErr } = await supabase
    .from('inspections')
    .update({ scheduled_at: scheduledAt })
    .eq('id', inspection.id);

  if (updateErr) {
    console.error('[checkout-date-sync] update failed', updateErr);
    await logEvent(supabase, {
      event_type: 'checkout_date_updated',
      external_object_id: external_object_id ?? null,
      property_id,
      payload: body,
      status: 'failed',
      failure_reason: 'update_failed',
      error_message: updateErr.message,
      inspection_id: inspection.id,
    });
    return json({ error: 'update_failed', detail: updateErr.message }, 500);
  }

  console.info(
    `[checkout-date-sync] updated inspection ${inspection.id}: ${currentDate} → ${scheduledAt}`,
  );

  await logEvent(supabase, {
    event_type: 'checkout_date_updated',
    external_object_id: external_object_id ?? null,
    property_id,
    payload: body,
    status: 'processed',
    inspection_id: inspection.id,
    normalized: {
      inspection_id: inspection.id,
      old_scheduled_at: currentDate,
      new_scheduled_at: scheduledAt,
    },
  });

  return json({
    status: 'updated',
    inspection_id: inspection.id,
    old_scheduled_at: currentDate,
    new_scheduled_at: scheduledAt,
  }, 200);
});

async function logEvent(
  supabase: ReturnType<typeof createClient>,
  opts: {
    event_type: string;
    external_object_id: string | null;
    property_id: string;
    payload: unknown;
    status: 'processed' | 'skipped' | 'failed';
    failure_reason?: string;
    error_message?: string;
    inspection_id?: string;
    normalized?: unknown;
  },
) {
  const { error } = await supabase.from('inspection_source_events').insert({
    source: 'hubspot',
    event_type: opts.event_type,
    payload_version: '1.0',
    external_object_id: opts.external_object_id,
    hubspot_property_id: opts.external_object_id,
    payload_json: opts.payload,
    normalized_payload_json: opts.normalized ?? null,
    processing_status: opts.status,
    failure_reason: opts.failure_reason ?? null,
    error_message: opts.error_message ?? null,
    processed_at: new Date().toISOString(),
    inspection_id: opts.inspection_id ?? null,
  });
  if (error) console.error('[checkout-date-sync] log insert failed', error);
}
