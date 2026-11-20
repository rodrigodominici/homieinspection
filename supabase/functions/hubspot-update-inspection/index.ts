import { isTestInspection } from '../_shared/test-inspection.ts';
import { resolveHubSpotProperty, usesDealObject, resolveAssigneeProperties, type HubSpotAction } from './property-map.ts';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import '../_shared/sandbox-guard.ts';
// Outbound HubSpot sync for inspections.
// Direct HubSpot REST API call using HUBSPOT_PRIVATE_APP_TOKEN (Path A).
// External target resolved via inspection_external_references — inspections
// stay decoupled from HubSpot. Every exit path writes to hubspot_sync_log.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const HUBSPOT_PRIVATE_APP_TOKEN = Deno.env.get('HUBSPOT_PRIVATE_APP_TOKEN');

const HUBSPOT_API_BASE = 'https://api.hubapi.com';
const DEFAULT_OBJECT_TYPE_ID = '2-47492934'; // Contrato de Locación (check_out)
const DEAL_OBJECT_TYPE_ID = '0-3';            // Deal estándar (captacion → pipeline Publicaciones CL)

type Action = HubSpotAction;
type LogStatus = 'success' | 'error' | 'skipped';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Extrae el ID numérico del external_object_id quitando el prefijo según el tipo
 * de inspección. check_out → "hs_contrato_<id>"; captacion → "hs_deal_<id>".
 */
function deriveNumericId(raw: string | null | undefined, inspectionType: string | null | undefined): string | null {
  if (!raw) return null;
  const prefix = inspectionType === 'captacion' || inspectionType === 'check_out' && /^hs_deal_/i.test(raw) ? /^hs_deal_/i : /^hs_contrato_/i;
  const stripped = raw.replace(prefix, '');
  if (!/^\d+$/.test(stripped)) return null;
  return stripped;
}

function toIsoDate(value: string | null | undefined, tz = 'UTC'): string | null {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  // Día calendario local del mercado: un envío nocturno no debe caer en el día siguiente (UTC).
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // Single exit helper — guarantees every code path leaves a hubspot_sync_log row.
  async function logAndRespond(
    httpStatus: number,
    body: Record<string, unknown>,
    logRow: {
      status: LogStatus;
      action?: string | null;
      inspection_id?: string | null;
      external_reference_id?: string | null;
      hubspot_object_type_id?: string | null;
      hubspot_object_id?: string | null;
      request_payload?: unknown;
      response_status?: number | null;
      response_body?: unknown;
      error_message?: string | null;
      triggered_by?: string | null;
      event_time?: string | null;
      retried_from_log_id?: string | null;
    },
  ) {
    try {
      const { data, error } = await admin
        .from('hubspot_sync_log')
        .insert({
          inspection_id: logRow.inspection_id ?? null,
          external_reference_id: logRow.external_reference_id ?? null,
          action: logRow.action ?? 'unknown',
          hubspot_object_type_id: logRow.hubspot_object_type_id ?? null,
          hubspot_object_id: logRow.hubspot_object_id ?? null,
          request_payload: logRow.request_payload ?? null,
          response_status: logRow.response_status ?? null,
          response_body: logRow.response_body ?? null,
          status: logRow.status,
          error_message: logRow.error_message ?? null,
          triggered_by: logRow.triggered_by ?? null,
          event_time: logRow.event_time ?? null,
          retried_from_log_id: logRow.retried_from_log_id ?? null,
        })
        .select('id')
        .maybeSingle();
      if (error) console.error('[hubspot-update-inspection] log insert failed', error);
      return jsonResponse({ ...body, log_id: data?.id ?? null }, httpStatus);
    } catch (e) {
      console.error('[hubspot-update-inspection] logAndRespond threw', e);
      return jsonResponse(body, httpStatus);
    }
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  // ── In-code JWT validation. Function is verify_jwt=false at the platform layer
  //    so unauthenticated calls still reach here and get logged. ──
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) {
    return logAndRespond(401, { ok: false, error: 'unauthorized' }, {
      status: 'error',
      error_message: 'unauthorized: missing_bearer_token',
    });
  }
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return logAndRespond(401, { ok: false, error: 'unauthorized' }, {
      status: 'error',
      error_message: `unauthorized: ${userErr?.message ?? 'invalid_token'}`,
    });
  }
  const triggeredBy = userData.user.id;

  // ── Parse body ──
  let body: { inspection_id?: string; action?: Action; event_time?: string; triggered_retry_from?: string };
  try {
    body = await req.json();
  } catch {
    return logAndRespond(400, { ok: false, error: 'invalid_json' }, {
      status: 'error',
      error_message: 'invalid_json',
      triggered_by: triggeredBy,
    });
  }
  const inspectionId = body.inspection_id;
  const action = body.action;
  const triggeredRetryFrom = typeof body.triggered_retry_from === 'string' ? body.triggered_retry_from : null;
  if (!inspectionId || typeof inspectionId !== 'string') {
    return logAndRespond(400, { ok: false, error: 'missing_inspection_id' }, {
      status: 'error',
      error_message: 'missing_inspection_id',
      action: action ?? null,
      triggered_by: triggeredBy,
      retried_from_log_id: triggeredRetryFrom,
    });
  }
  if (action !== 'key_collection_date' && action !== 'checkout_received' && action !== 'checkin_completed' && action !== 'final_inspector') {
    return logAndRespond(400, { ok: false, error: 'invalid_action' }, {
      status: 'error',
      error_message: `invalid_action:${String(action)}`,
      inspection_id: inspectionId,
      triggered_by: triggeredBy,
      retried_from_log_id: triggeredRetryFrom,
    });
  }

  if (await isTestInspection(admin, inspectionId)) {
    return logAndRespond(200, { ok: true, skipped: 'test_inspection' }, {
      status: 'skipped', error_message: 'test_inspection', action, inspection_id: inspectionId,
      triggered_by: triggeredBy, retried_from_log_id: triggeredRetryFrom,
    });
  }

  // ── Credential check ──
  if (!HUBSPOT_PRIVATE_APP_TOKEN) {
    return logAndRespond(500, { ok: false, error: 'hubspot_private_app_token_missing' }, {
      status: 'error',
      action,
      inspection_id: inspectionId,
      triggered_by: triggeredBy,
      error_message: 'hubspot_private_app_token_missing',
      retried_from_log_id: triggeredRetryFrom,
    });
  }

  // ── Load inspection ──
  const { data: inspection, error: inspErr } = await admin
    .from('inspections')
    .select('id, inspection_type, market, property_overrides_json, property_snapshot_json, inspection_completed_at, status, inspector_id, executive_id')
    .eq('id', inspectionId)
    .maybeSingle();
  if (inspErr || !inspection) {
    return logAndRespond(404, { ok: false, error: 'inspection_not_found' }, {
      status: 'error',
      action,
      inspection_id: inspectionId,
      triggered_by: triggeredBy,
      error_message: `inspection_not_found: ${inspErr?.message ?? ''}`,
      retried_from_log_id: triggeredRetryFrom,
    });
  }

  // ── Check-in nunca escribe fechas de salida (recolección de llaves / recepción de check-out) ──
  if (inspection.inspection_type === 'check_in' && action !== 'checkin_completed') {
    return logAndRespond(200, { ok: true, skipped: true, reason: 'checkin_no_checkout_dates' }, {
      status: 'skipped',
      action,
      inspection_id: inspectionId,
      triggered_by: triggeredBy,
      error_message: 'checkin_no_checkout_dates',
      retried_from_log_id: triggeredRetryFrom,
    });
  }

  // ── Derive event_time + HubSpot date value per action ──
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
      return logAndRespond(200, { ok: true, skipped: true, reason: 'missing_key_date' }, {
        status: 'skipped',
        action,
        inspection_id: inspectionId,
        triggered_by: triggeredBy,
        error_message: 'missing_key_date',
        retried_from_log_id: triggeredRetryFrom,
      });
    }
  } else if (action === 'final_inspector') {
    const { data: wo } = await admin.from('inspection_work_orders').select('final_inspector_id')
      .eq('inspection_id', inspectionId).not('final_inspector_id', 'is', null)
      .order('assigned_at', { ascending: false }).limit(1).maybeSingle();
    const { data: prof } = wo?.final_inspector_id
      ? await admin.from('profiles').select('email').eq('id', wo.final_inspector_id).maybeSingle()
      : { data: null };
    hubspotDateValue = await resolveOwnerIdByEmail(prof?.email ?? null);
    eventTimeIso = new Date().toISOString();
    if (!hubspotDateValue) {
      return logAndRespond(200, { ok: true, skipped: true, reason: 'final_inspector_owner_not_found' }, {
        status: 'skipped', action, inspection_id: inspectionId, triggered_by: triggeredBy,
        error_message: 'final_inspector_owner_not_found', retried_from_log_id: triggeredRetryFrom,
      });
    }
  } else if (action === 'checkin_completed') {
    if (inspection.inspection_type !== 'check_in' || inspection.status !== 'sent') {
      return logAndRespond(200, { ok: true, skipped: true, reason: 'not_finalized_checkin' }, {
        status: 'skipped',
        action,
        inspection_id: inspectionId,
        triggered_by: triggeredBy,
        error_message: `not_finalized_checkin:${inspection.inspection_type}:${inspection.status}`,
        retried_from_log_id: triggeredRetryFrom,
      });
    }
    eventTimeIso = new Date().toISOString();
    // HubSpot define checkin_hi_completo como opciones "true"/"false": "Sí" devuelve INVALID_OPTION.
    hubspotDateValue = 'true';
  } else {
    const candidate = body.event_time ?? inspection.inspection_completed_at ?? new Date().toISOString();
    eventTimeIso = candidate;
    hubspotDateValue = toIsoDate(candidate, inspection.market === 'MX' ? 'America/Mexico_City' : 'America/Santiago');
    if (!hubspotDateValue) {
      return logAndRespond(400, { ok: false, error: 'invalid_event_time' }, {
        status: 'error',
        action,
        inspection_id: inspectionId,
        triggered_by: triggeredBy,
        error_message: 'invalid_event_time',
        retried_from_log_id: triggeredRetryFrom,
      });
    }
  }

  // ── Resolve external reference (tipo depende de la inspección) ──
  const isCaptacion = usesDealObject(inspection.inspection_type, inspection.market);
  const externalObjectType = isCaptacion ? 'deal' : 'lease_contract';

  const { data: ref, error: refErr } = await admin
    .from('inspection_external_references')
    .select('id, external_object_id, external_object_type_id')
    .eq('inspection_id', inspectionId)
    .eq('provider', 'hubspot')
    .eq('external_object_type', externalObjectType)
    .eq('is_active', true)
    .maybeSingle();

  if (refErr) {
    return logAndRespond(500, { ok: false, error: 'reference_lookup_failed' }, {
      status: 'error',
      action,
      inspection_id: inspectionId,
      triggered_by: triggeredBy,
      event_time: eventTimeIso,
      error_message: `reference_lookup_failed: ${refErr.message}`,
      retried_from_log_id: triggeredRetryFrom,
    });
  }
  if (!ref) {
    return logAndRespond(200, { ok: true, skipped: true, reason: 'no_active_external_reference' }, {
      status: 'skipped',
      action,
      inspection_id: inspectionId,
      triggered_by: triggeredBy,
      event_time: eventTimeIso,
      error_message: `no_active_external_reference:${externalObjectType}`,
      retried_from_log_id: triggeredRetryFrom,
    });
  }

  const numericId = deriveNumericId(ref.external_object_id, inspection.inspection_type);
  const objectTypeId =
    ref.external_object_type_id ?? (isCaptacion ? DEAL_OBJECT_TYPE_ID : DEFAULT_OBJECT_TYPE_ID);

  if (!numericId) {
    return logAndRespond(400, { ok: false, error: 'invalid_external_object_id' }, {
      status: 'error',
      action,
      inspection_id: inspectionId,
      external_reference_id: ref.id,
      hubspot_object_type_id: objectTypeId,
      hubspot_object_id: ref.external_object_id,
      triggered_by: triggeredBy,
      event_time: eventTimeIso,
      error_message: `invalid_external_object_id: ${ref.external_object_id}`,
      retried_from_log_id: triggeredRetryFrom,
    });
  }

  // ── PATCH HubSpot directly ──
  // captacion → endpoint /deals/{id} (URL-friendly alias para object type 0-3);
  // check_out → endpoint /{objectTypeId}/{id} con el custom object type.
  // Captaciones use country-specific deal fields; check-outs keep the contract field.
  const propertyName = resolveHubSpotProperty(action, inspection.inspection_type, inspection.market);
  if (!propertyName) {
    return logAndRespond(200, { ok: true, skipped: true, reason: 'property_not_defined' }, {
      status: 'skipped', action, inspection_id: inspectionId, external_reference_id: ref.id,
      triggered_by: triggeredBy, event_time: eventTimeIso,
      error_message: `property_not_defined:${inspection.inspection_type}:${inspection.market}`,
      retried_from_log_id: triggeredRetryFrom,
    });
  }
  const assigneeProps = action === 'final_inspector' ? {} : await loadAssigneeProperties(admin, inspection);
  const requestPayload = { properties: { [propertyName]: hubspotDateValue, ...assigneeProps } };
  const objectPathSegment = isCaptacion ? 'deals' : encodeURIComponent(objectTypeId);
  const url = `${HUBSPOT_API_BASE}/crm/v3/objects/${objectPathSegment}/${encodeURIComponent(numericId)}`;

  let responseStatus: number | null = null;
  let responseBody: unknown = null;
  let status: LogStatus = 'error';
  let errorMessage: string | null = null;
  let httpStatusOut = 200;

  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${HUBSPOT_PRIVATE_APP_TOKEN}`,
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
      httpStatusOut = 200;
    } else {
      status = 'error';
      errorMessage = `hubspot_patch_failed_${res.status}`;
      httpStatusOut = 502;
    }
  } catch (err) {
    status = 'error';
    errorMessage = `request_failed: ${(err as Error).message}`;
    httpStatusOut = 502;
  }

  return logAndRespond(
    httpStatusOut,
    { ok: status === 'success', status, response_status: responseStatus },
    {
      status,
      action,
      inspection_id: inspectionId,
      external_reference_id: ref.id,
      hubspot_object_type_id: objectTypeId,
      hubspot_object_id: numericId,
      request_payload: requestPayload,
      response_status: responseStatus,
      response_body: responseBody,
      error_message: errorMessage,
      triggered_by: triggeredBy,
      event_time: eventTimeIso,
      retried_from_log_id: triggeredRetryFrom,
    },
  );
});


/** Resolves HI receptor/executive emails to HubSpot owner IDs (Chile check-out only). */
async function loadAssigneeProperties(
  admin: any,
  inspection: { inspection_type: string; market: string; inspector_id: string | null; executive_id: string | null },
): Promise<Record<string, string>> {
  if (inspection.inspection_type !== 'check_out' || inspection.market !== 'CL') return {};
  const ids = [inspection.inspector_id, inspection.executive_id].filter(Boolean) as string[];
  if (ids.length === 0) return {};
  const { data: profiles } = await admin.from('profiles').select('id,email').in('id', ids);
  const emailOf = (id: string | null) => (profiles ?? []).find((p: any) => p.id === id)?.email ?? null;
  const ownerFor = async (email: string | null): Promise<string | null> => {
    if (!email) return null;
    try {
      const res = await fetch(`${HUBSPOT_API_BASE}/crm/v3/owners?email=${encodeURIComponent(email)}&limit=1`, {
        headers: { Authorization: `Bearer ${HUBSPOT_PRIVATE_APP_TOKEN}` },
      });
      if (!res.ok) return null;
      const body = await res.json();
      return body?.results?.[0]?.id ? String(body.results[0].id) : null;
    } catch { return null; }
  };
  const [receptor, executive] = await Promise.all([
    ownerFor(emailOf(inspection.inspector_id)),
    ownerFor(emailOf(inspection.executive_id)),
  ]);
  return resolveAssigneeProperties(inspection.inspection_type, inspection.market, { receptor, executive });
}

async function resolveOwnerIdByEmail(email: string | null): Promise<string | null> {
  if (!email) return null;
  try {
    const res = await fetch(`${HUBSPOT_API_BASE}/crm/v3/owners?email=${encodeURIComponent(email)}&limit=1`, {
      headers: { Authorization: `Bearer ${HUBSPOT_PRIVATE_APP_TOKEN}` },
    });
    if (!res.ok) return null;
    const body = await res.json();
    return body?.results?.[0]?.id ? String(body.results[0].id) : null;
  } catch { return null; }
}
