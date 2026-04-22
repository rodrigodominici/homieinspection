// Outbound HubSpot sync for inspections.
// Pushes inspection events back to HubSpot via the connector gateway.
// Resolves the target external object via inspection_external_references —
// inspections themselves stay decoupled from HubSpot.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const HUBSPOT_API_KEY = Deno.env.get('HUBSPOT_API_KEY');

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/hubspot';

type Action = 'key_collection_date' | 'checkout_received';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function logSync(
  admin: ReturnType<typeof createClient>,
  row: Record<string, unknown>,
) {
  const { data, error } = await admin
    .from('hubspot_sync_log')
    .insert(row)
    .select('id')
    .maybeSingle();
  if (error) console.error('[hubspot-update-inspection] log insert failed', error);
  return data?.id ?? null;
}

function deriveNumericId(raw: string): string | null {
  if (!raw) return null;
  // Strip optional 'hs_contrato_' prefix or any non-digit prefix
  const digits = raw.replace(/[^0-9]/g, '');
  if (!digits) return null;
  return digits;
}

function toIsoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  // Auth: validate the caller JWT
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return jsonResponse({ error: 'unauthorized' }, 401);

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return jsonResponse({ error: 'unauthorized' }, 401);
  const triggeredBy = userData.user.id;

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // Parse body
  let body: { inspection_id?: string; action?: Action; event_time?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400);
  }
  const inspectionId = body.inspection_id;
  const action = body.action;
  if (!inspectionId || typeof inspectionId !== 'string') {
    return jsonResponse({ error: 'missing_inspection_id' }, 400);
  }
  if (action !== 'key_collection_date' && action !== 'checkout_received') {
    return jsonResponse({ error: 'invalid_action' }, 400);
  }

  // Connector gateway env
  if (!LOVABLE_API_KEY || !HUBSPOT_API_KEY) {
    await logSync(admin, {
      inspection_id: inspectionId,
      action,
      status: 'error',
      error_message: 'connector_secrets_missing',
      triggered_by: triggeredBy,
    });
    return jsonResponse({ ok: false, error: 'connector_secrets_missing' }, 500);
  }

  // Fetch inspection
  const { data: inspection, error: inspErr } = await admin
    .from('inspections')
    .select('id, property_overrides_json, property_snapshot_json, inspection_completed_at, status')
    .eq('id', inspectionId)
    .maybeSingle();
  if (inspErr || !inspection) {
    await logSync(admin, {
      inspection_id: inspectionId,
      action,
      status: 'error',
      error_message: 'inspection_not_found',
      triggered_by: triggeredBy,
    });
    return jsonResponse({ ok: false, error: 'inspection_not_found' }, 404);
  }

  // Resolve event_time per action (refinement #3 — never use updated_at)
  let eventTimeIso: string | null = null;
  let hubspotDateValue: string | null = null;

  if (action === 'key_collection_date') {
    const overrides = (inspection.property_overrides_json ?? {}) as Record<string, unknown>;
    const snap = (inspection.property_snapshot_json ?? {}) as Record<string, unknown>;
    const dateStr =
      (overrides.fecha_recoleccion_llaves as string | undefined) ??
      (snap.fecha_recoleccion_llaves as string | undefined) ??
      null;
    hubspotDateValue = toIsoDate(dateStr);
    eventTimeIso = dateStr ? new Date(dateStr).toISOString() : null;
    if (!hubspotDateValue) {
      const logId = await logSync(admin, {
        inspection_id: inspectionId,
        action,
        status: 'error',
        error_message: 'missing_key_date',
        triggered_by: triggeredBy,
      });
      return jsonResponse({ ok: false, error: 'missing_key_date', log_id: logId }, 400);
    }
  } else {
    // checkout_received — explicit submit timestamp from caller, then completed_at, then now()
    const candidate =
      body.event_time ?? inspection.inspection_completed_at ?? new Date().toISOString();
    eventTimeIso = candidate;
    hubspotDateValue = toIsoDate(candidate);
    if (!hubspotDateValue) {
      const logId = await logSync(admin, {
        inspection_id: inspectionId,
        action,
        status: 'error',
        error_message: 'invalid_event_time',
        triggered_by: triggeredBy,
      });
      return jsonResponse({ ok: false, error: 'invalid_event_time', log_id: logId }, 400);
    }
  }

  // Resolve external reference
  const { data: ref, error: refErr } = await admin
    .from('inspection_external_references')
    .select('id, external_object_id, external_object_type_id')
    .eq('inspection_id', inspectionId)
    .eq('provider', 'hubspot')
    .eq('external_object_type', 'lease_contract')
    .eq('is_active', true)
    .maybeSingle();

  if (refErr) {
    const logId = await logSync(admin, {
      inspection_id: inspectionId,
      action,
      status: 'error',
      error_message: `reference_lookup_failed: ${refErr.message}`,
      triggered_by: triggeredBy,
      event_time: eventTimeIso,
    });
    return jsonResponse({ ok: false, error: 'reference_lookup_failed', log_id: logId }, 500);
  }

  if (!ref) {
    const logId = await logSync(admin, {
      inspection_id: inspectionId,
      action,
      status: 'skipped',
      error_message: 'no_active_external_reference',
      triggered_by: triggeredBy,
      event_time: eventTimeIso,
    });
    return jsonResponse({ ok: true, skipped: true, log_id: logId });
  }

  const numericId = deriveNumericId(ref.external_object_id);
  if (!numericId) {
    const logId = await logSync(admin, {
      inspection_id: inspectionId,
      external_reference_id: ref.id,
      action,
      hubspot_object_type_id: ref.external_object_type_id ?? null,
      hubspot_object_id: ref.external_object_id,
      status: 'error',
      error_message: 'invalid_external_object_id',
      triggered_by: triggeredBy,
      event_time: eventTimeIso,
    });
    return jsonResponse({ ok: false, error: 'invalid_external_object_id', log_id: logId }, 400);
  }

  const objectTypeId = ref.external_object_type_id ?? '2-47492934';
  const propertyName =
    action === 'key_collection_date' ? 'fecha_recoleccion_llaves' : 'fecha_recepcion_checkout';
  const requestPayload = { properties: { [propertyName]: hubspotDateValue } };
  const url = `${GATEWAY_URL}/crm/v3/objects/${encodeURIComponent(objectTypeId)}/${encodeURIComponent(numericId)}`;

  let responseStatus = 0;
  let responseBody: unknown = null;
  let status: 'success' | 'error' = 'error';
  let errorMessage: string | null = null;

  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'X-Connection-Api-Key': HUBSPOT_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestPayload),
    });
    responseStatus = res.status;
    const text = await res.text();
    try {
      responseBody = text ? JSON.parse(text) : null;
    } catch {
      responseBody = text;
    }
    if (res.ok) {
      status = 'success';
    } else {
      status = 'error';
      errorMessage = `hubspot_patch_failed_${res.status}`;
    }
  } catch (err) {
    errorMessage = `request_failed: ${(err as Error).message}`;
  }

  const logId = await logSync(admin, {
    inspection_id: inspectionId,
    external_reference_id: ref.id,
    action,
    hubspot_object_type_id: objectTypeId,
    hubspot_object_id: numericId,
    request_payload: requestPayload,
    response_status: responseStatus || null,
    response_body: responseBody,
    status,
    error_message: errorMessage,
    triggered_by: triggeredBy,
    event_time: eventTimeIso,
  });

  return jsonResponse({ ok: status === 'success', status, log_id: logId });
});
