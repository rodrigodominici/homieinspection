import { readTestFlag } from '../_shared/test-inspection.ts';
import '../_shared/sandbox-guard.ts';
// HubSpot → Homie inspection intake webhook
// - Validates X-Webhook-Secret
// - Validates payload (zod-light: manual)
// - Dedupes by (source, external_event_id) using partial unique index
// - Persists raw + normalized + generated structure
// - Returns 202 fast; processes via EdgeRuntime.waitUntil
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { generateSections, normalizeIncomingPayload } from '../_shared/inspection-generator.ts';
import { enrichCaptacionUnit } from '../_shared/hubspot-unit.ts';
import { applySourceDefaults, isAuthorizedForSource, upsertExternalReference, type IntakeSource } from '../_shared/intake-source.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SECRETS = {
  hubspot: Deno.env.get('HUBSPOT_INTAKE_SECRET') ?? '',
  rent_manager: Deno.env.get('RENT_MANAGER_INTAKE_SECRET') ?? '',
};

async function sha256Hex(input: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function validateEnvelope(body: any): { ok: true; data: any } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'body_not_object' };
  if (body.source !== 'hubspot' && body.source !== 'rent_manager') return { ok: false, error: 'invalid_source' };
  if (typeof body.event_type !== 'string') return { ok: false, error: 'missing_event_type' };
  if (typeof body.payload_version !== 'string') return { ok: false, error: 'missing_payload_version' };
  if (!body.data || typeof body.data !== 'object') return { ok: false, error: 'missing_data' };
  const d = body.data;
  for (const f of ['property_id', 'market', 'inspection_type']) {
    if (typeof d[f] !== 'string' || !d[f]) return { ok: false, error: `missing_data.${f}` };
  }
  for (const f of ['inspector_email', 'executive_email']) {
    if (d[f] !== undefined && d[f] !== null && typeof d[f] !== 'string') {
      return { ok: false, error: `invalid_data.${f}` };
    }
  }
  for (const f of ['inspector', 'executive']) {
    if (d[f] !== undefined && d[f] !== null) {
      if (typeof d[f] !== 'object' || Array.isArray(d[f])) {
        return { ok: false, error: `invalid_data.${f}` };
      }
      if (d[f].email !== undefined && d[f].email !== null && typeof d[f].email !== 'string') {
        return { ok: false, error: `invalid_data.${f}.email` };
      }
    }
  }
  return { ok: true, data: body };
}

function extractSlotEmail(data: any, slot: 'inspector' | 'executive'): string | null {
  const nested = data?.[slot]?.email;
  const flat = data?.[`${slot}_email`];
  const v = (typeof nested === 'string' && nested) ? nested
          : (typeof flat === 'string' && flat) ? flat
          : null;
  return v ? v.trim().toLowerCase() : null;
}

type ResolutionStep = { step: string; outcome: 'hit' | 'miss' | 'error'; detail: string };
type SlotResolution = {
  input_email: string | null;
  resolved_via: 'profile' | 'unresolved' | 'absent';
  resolved_profile_id: string | null;
  steps: ResolutionStep[];
  warnings: string[];
};

async function resolveAssignment(
  supabase: any,
  rawEmail: string | undefined | null,
  slot: 'inspector' | 'executive',
  inspectionType?: string | null,
): Promise<SlotResolution> {
  // El receptor de un check-in es un Property Advisor; el resto, un Inspector.
  const roleForSlot = slot === 'inspector' && inspectionType === 'check_in' ? 'property_advisor' : slot;
  const email = (rawEmail ?? '').trim().toLowerCase();
  if (!email) {
    return { input_email: null, resolved_via: 'absent', resolved_profile_id: null, steps: [], warnings: [] };
  }
  const steps: ResolutionStep[] = [];
  const warnings: string[] = [];

  // Single step: match by email + role on profiles (case-insensitive, active only).
  try {
    const { data: profRows, error: profErr } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('is_active', true)
      .eq('role', roleForSlot)
      .ilike('email', email)
      .limit(1);

    if (profErr) {
      steps.push({ step: 'profiles_lookup', outcome: 'error', detail: profErr.message });
    } else if (profRows && profRows.length > 0) {
      steps.push({
        step: 'profiles_lookup',
        outcome: 'hit',
        detail: `matched profiles.email=${email} + role=${slot}`,
      });
      return { input_email: email, resolved_via: 'profile', resolved_profile_id: profRows[0].id, steps, warnings };
    } else {
      steps.push({
        step: 'profiles_lookup',
        outcome: 'miss',
        detail: `no active profile with email=${email} and role=${slot}`,
      });
    }
  } catch (e) {
    steps.push({ step: 'profiles_lookup', outcome: 'error', detail: (e as Error).message });
  }

  warnings.push(`No se pudo resolver ${slot}_email=${email} en profiles.`);
  return { input_email: email, resolved_via: 'unresolved', resolved_profile_id: null, steps, warnings };
}


// Generate the full 15-screen structure using the canonical shared generator.
// Fallback: if data.__generated__ is precomputed (replays/tests only), respect it.
// TODO: remove __generated__ fallback after intake stabilization (target: 2 sprints).
function buildGeneratedStructure(data: any): { sections: unknown[]; precomputed: boolean } {
  if (data && data.__generated__ && Array.isArray(data.__generated__.sections)) {
    return { sections: data.__generated__.sections, precomputed: true };
  }
  const normalized = normalizeIncomingPayload(data);
  return { sections: generateSections(normalized as any), precomputed: false };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // 2. Parse body
  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // 1. Auth — each source only accepts its own secret.
  const provided = req.headers.get('x-webhook-secret') ?? '';
  if (!isAuthorizedForSource(body?.source, provided, SECRETS)) {
    console.warn('[intake] rejected: invalid secret');
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const source = body.source as IntakeSource;

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const requestId = crypto.randomUUID();
  const headersSubset = {
    'user-agent': req.headers.get('user-agent'),
    'x-forwarded-for': req.headers.get('x-forwarded-for'),
  };

  // 3. Validate envelope
  const validation = validateEnvelope(body);
  if (!validation.ok) {
    // Persist for debug
    const { data: failedRow } = await supabase
      .from('inspection_source_events')
      .insert({
        source,
        event_type: body?.event_type ?? null,
        payload_version: body?.payload_version ?? null,
        external_event_id: null,
        external_object_id: body?.external_object_id ?? null,
        hubspot_property_id: source === 'hubspot' ? (body?.external_object_id ?? null) : null,
        payload_json: body ?? {},
        processing_status: 'failed',
        failure_reason: 'payload_validation',
        error_message: validation.error,
        processed_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    return new Response(
      JSON.stringify({ status: 'invalid_payload', error: validation.error, event_id: failedRow?.id }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // 4. Compute idempotency key
  let externalEventId: string = body.external_event_id;
  if (!externalEventId) {
    const d = body.data;
    const truncated = new Date().toISOString().slice(0, 13); // hour bucket
    externalEventId = await sha256Hex(
      `${source}|${body.event_type}|${body.external_object_id ?? ''}|${body.payload_version}|${d.property_id}|${d.inspection_type}|${truncated}`,
    );
  }

  // Preserve the original webhook for audit; enrich only normalized inspection data.
  let intakeData = applySourceDefaults(source, body.data);
  let unitRecoveryWarning: string | undefined;
  if (source === 'hubspot') {
    try {
      intakeData = await enrichCaptacionUnit(body.data, body.external_object_id, Deno.env.get('HUBSPOT_PRIVATE_APP_TOKEN'));
    } catch (error) {
      unitRecoveryWarning = (error as Error).message;
      console.warn('[intake] apartment recovery failed:', unitRecoveryWarning);
    }
  }

  // 5. Generate full structure (Fix A: real generator, not placeholder)
  let generatedStructure: { sections: unknown[] };
  let structurePrecomputed = false;
  try {
    const built = buildGeneratedStructure(intakeData);
    generatedStructure = { sections: built.sections };
    structurePrecomputed = built.precomputed;
  } catch (err) {
    const { data: failedRow } = await supabase
      .from('inspection_source_events')
      .insert({
        source,
        event_type: body.event_type,
        payload_version: body.payload_version,
        external_event_id: null,
        external_object_id: body.external_object_id ?? null,
        hubspot_property_id: source === 'hubspot' ? (body.external_object_id ?? null) : null,
        payload_json: body,
        processing_status: 'failed',
        failure_reason: 'structure_generation',
        processing_step: 'structure_generation',
        error_message: (err as Error).message,
        processed_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    return new Response(
      JSON.stringify({ status: 'structure_generation_failed', error: (err as Error).message, event_id: failedRow?.id }),
      { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // Resolve assignment ids from emails (does NOT decide status — RPC does)
  const inspectorEmail = extractSlotEmail(body.data, 'inspector');
  const executiveEmail = extractSlotEmail(body.data, 'executive');
  const inspectorRes = await resolveAssignment(supabase, inspectorEmail, 'inspector', body.data?.inspection_type);
  const executiveRes = await resolveAssignment(supabase, executiveEmail, 'executive');

  // Preserve any pre-existing { id, email } blocks; only fill id when we resolved one.
  const existingInspector = (body.data.inspector && typeof body.data.inspector === 'object') ? body.data.inspector : {};
  const existingExecutive = (body.data.executive && typeof body.data.executive === 'object') ? body.data.executive : {};

  const normalizedInspector = {
    ...existingInspector,
    ...(inspectorRes.resolved_profile_id ? { id: inspectorRes.resolved_profile_id } : {}),
    ...(inspectorRes.input_email ? { email: inspectorRes.input_email } : {}),
  };
  const normalizedExecutive = {
    ...existingExecutive,
    ...(executiveRes.resolved_profile_id ? { id: executiveRes.resolved_profile_id } : {}),
    ...(executiveRes.input_email ? { email: executiveRes.input_email } : {}),
  };

  // Normalizamos alias y fechas (HubSpot manda epoch ms) antes de persistir.
  const normalizedData = normalizeIncomingPayload(intakeData as any) as any;

  const normalized = {
    ...normalizedData,
    inspector: Object.keys(normalizedInspector).length ? normalizedInspector : undefined,
    executive: Object.keys(normalizedExecutive).length ? normalizedExecutive : undefined,
    __generated__: generatedStructure,
    __snapshot__: normalizedData,
    ...(unitRecoveryWarning ? { __unit_recovery_warning__: unitRecoveryWarning } : {}),
    __assignment__: {
      inspector: inspectorRes,
      executive: executiveRes,
    },
  };


  const { data: inserted, error: insertErr } = await supabase
    .from('inspection_source_events')
    .insert({
      source,
      event_type: body.event_type,
      payload_version: body.payload_version,
      external_event_id: externalEventId,
      external_object_id: body.external_object_id ?? null,
      hubspot_property_id: source === 'hubspot' ? (body.external_object_id ?? null) : null,
      payload_json: body,
      normalized_payload_json: normalized,
      processing_status: 'received',
      processing_step: structurePrecomputed ? 'structure_generation_skipped_precomputed' : 'structure_generated',
    })
    .select('id')
    .maybeSingle();

  // 6. Duplicate path
  if (!inserted) {
    const { data: original } = await supabase
      .from('inspection_source_events')
      .select('id, processing_status, duplicate_count, duplicate_attempts_json')
      .eq('source', source)
      .eq('external_event_id', externalEventId)
      .maybeSingle();

    if (original) {
      const attempts = Array.isArray(original.duplicate_attempts_json)
        ? original.duplicate_attempts_json
        : [];
      attempts.push({
        received_at: new Date().toISOString(),
        request_id: requestId,
        headers_subset: headersSubset,
      });
      await supabase
        .from('inspection_source_events')
        .update({
          duplicate_count: (original.duplicate_count ?? 0) + 1,
          duplicate_attempts_json: attempts,
        })
        .eq('id', original.id);

      return new Response(
        JSON.stringify({
          status: 'duplicate',
          original_event_id: original.id,
          original_status: original.processing_status,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.error('[intake] insert error', insertErr);
    return new Response(JSON.stringify({ error: 'insert_failed', detail: insertErr?.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const eventId = inserted.id;

  // 7. Schedule background processing (do not await)
  const processPromise = (async () => {
    try {
      await supabase
        .from('inspection_source_events')
        .update({ processing_status: 'processing', processing_started_at: new Date().toISOString() })
        .eq('id', eventId);

      const { data: rpcResult, error: rpcError } = await supabase.rpc('create_inspection_from_event', {
        p_event_id: eventId,
      });

      if (rpcError) {
        await supabase
          .from('inspection_source_events')
          .update({
            processing_status: 'failed',
            failure_reason: 'inspection_creation',
            error_message: rpcError.message,
            processed_at: new Date().toISOString(),
          })
          .eq('id', eventId);
      } else {
        const row = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;
        if (row?.failure_reason) {
          console.warn('[intake] RPC reported failure', row);
        } else {
          if (row?.inspection_id && readTestFlag(source, body)) {
            await supabase.from('inspections').update({ is_test: true }).eq('id', row.inspection_id);
          }
        }
        if (!row?.failure_reason && row?.inspection_id && body.external_object_id) {
          // Persist external reference (decoupled — inspections table stays source-agnostic)
          try {
            await upsertExternalReference(supabase, {
              inspectionId: row.inspection_id as string,
              source,
              body,
              externalObjectId: body.external_object_id,
              externalEventId,
              sourceEventId: eventId,
            });
          } catch (refErr) {
            console.error('[intake] external_reference flow error', refErr);
          }
        }
      }
    } catch (err) {
      console.error('[intake] background error', err);
      await supabase
        .from('inspection_source_events')
        .update({
          processing_status: 'failed',
          failure_reason: 'unknown',
          error_message: (err as Error).message,
          processed_at: new Date().toISOString(),
        })
        .eq('id', eventId);
    }
  })();

  // @ts-ignore EdgeRuntime
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(processPromise);
  }

  return new Response(
    JSON.stringify({ status: 'accepted', event_id: eventId, external_event_id: externalEventId }),
    { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
