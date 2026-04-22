// HubSpot → Homie inspection intake webhook
// - Validates X-Webhook-Secret
// - Validates payload (zod-light: manual)
// - Dedupes by (source, external_event_id) using partial unique index
// - Persists raw + normalized + generated structure
// - Returns 202 fast; processes via EdgeRuntime.waitUntil
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { generateSections, normalizeIncomingPayload } from '../_shared/inspection-generator.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const INTAKE_SECRET = Deno.env.get('HUBSPOT_INTAKE_SECRET') ?? '';

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

async function sha256Hex(input: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function validateEnvelope(body: any): { ok: true; data: any } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'body_not_object' };
  if (body.source !== 'hubspot') return { ok: false, error: 'invalid_source' };
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
  resolved_via: 'mapping' | 'profile' | 'unresolved' | 'absent';
  resolved_profile_id: string | null;
  steps: ResolutionStep[];
  warnings: string[];
};

async function resolveAssignment(
  supabase: any,
  rawEmail: string | undefined | null,
  slot: 'inspector' | 'executive',
): Promise<SlotResolution> {
  const email = (rawEmail ?? '').trim().toLowerCase();
  if (!email) {
    return { input_email: null, resolved_via: 'absent', resolved_profile_id: null, steps: [], warnings: [] };
  }
  const steps: ResolutionStep[] = [];
  const warnings: string[] = [];

  // Step 1: external_user_mappings (case-insensitive on hubspot_email)
  try {
    const { data: mapRows, error: mapErr } = await supabase
      .from('external_user_mappings')
      .select('profile_id, role_hint')
      .eq('provider', 'hubspot')
      .eq('is_active', true)
      .ilike('hubspot_email', email);

    if (mapErr) {
      steps.push({ step: 'external_user_mappings', outcome: 'error', detail: mapErr.message });
    } else {
      const match = (mapRows ?? []).find(
        (r: any) => !r.role_hint || r.role_hint === slot,
      );
      if (match?.profile_id) {
        steps.push({
          step: 'external_user_mappings',
          outcome: 'hit',
          detail: `matched provider=hubspot, hubspot_email=${email}${match.role_hint ? `, role_hint=${match.role_hint}` : ', no role_hint'}`,
        });
        return { input_email: email, resolved_via: 'mapping', resolved_profile_id: match.profile_id, steps, warnings };
      }
      steps.push({
        step: 'external_user_mappings',
        outcome: 'miss',
        detail: `no active mapping for hubspot_email=${email}${(mapRows ?? []).length ? ' (role_hint mismatch)' : ''}`,
      });
    }
  } catch (e) {
    steps.push({ step: 'external_user_mappings', outcome: 'error', detail: (e as Error).message });
  }

  // Step 2: profiles fallback (case-insensitive on email, role-scoped)
  try {
    const { data: profRows, error: profErr } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('is_active', true)
      .eq('role', slot)
      .ilike('email', email)
      .limit(1);

    if (profErr) {
      steps.push({ step: 'profiles_fallback', outcome: 'error', detail: profErr.message });
    } else if (profRows && profRows.length > 0) {
      steps.push({
        step: 'profiles_fallback',
        outcome: 'hit',
        detail: `matched profiles.email=${email} + role=${slot}`,
      });
      return { input_email: email, resolved_via: 'profile', resolved_profile_id: profRows[0].id, steps, warnings };
    } else {
      steps.push({
        step: 'profiles_fallback',
        outcome: 'miss',
        detail: `no active profile with email=${email} and role=${slot}`,
      });
    }
  } catch (e) {
    steps.push({ step: 'profiles_fallback', outcome: 'error', detail: (e as Error).message });
  }

  warnings.push(`No se pudo resolver ${slot}_email=${email} en mapping ni profiles.`);
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

  // 1. Auth
  const provided = req.headers.get('x-webhook-secret') ?? '';
  if (!INTAKE_SECRET || !timingSafeEqual(provided, INTAKE_SECRET)) {
    console.warn('[intake] rejected: invalid secret');
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
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
        source: 'hubspot',
        event_type: body?.event_type ?? null,
        payload_version: body?.payload_version ?? null,
        external_event_id: null,
        external_object_id: body?.external_object_id ?? null,
        hubspot_property_id: body?.external_object_id ?? null,
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
      `hubspot|${body.event_type}|${body.external_object_id ?? ''}|${body.payload_version}|${d.property_id}|${d.inspection_type}|${truncated}`,
    );
  }

  // 5. Generate full structure (Fix A: real generator, not placeholder)
  let generatedStructure: { sections: unknown[] };
  let structurePrecomputed = false;
  try {
    const built = buildGeneratedStructure(body.data);
    generatedStructure = { sections: built.sections };
    structurePrecomputed = built.precomputed;
  } catch (err) {
    const { data: failedRow } = await supabase
      .from('inspection_source_events')
      .insert({
        source: 'hubspot',
        event_type: body.event_type,
        payload_version: body.payload_version,
        external_event_id: null,
        external_object_id: body.external_object_id ?? null,
        hubspot_property_id: body.external_object_id ?? null,
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
  const inspectorRes = await resolveAssignment(supabase, inspectorEmail, 'inspector');
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

  const normalized = {
    ...body.data,
    inspector: Object.keys(normalizedInspector).length ? normalizedInspector : undefined,
    executive: Object.keys(normalizedExecutive).length ? normalizedExecutive : undefined,
    __generated__: generatedStructure,
    __snapshot__: body.data,
    __assignment__: {
      inspector: inspectorRes,
      executive: executiveRes,
    },
  };

  const { data: inserted, error: insertErr } = await supabase
    .from('inspection_source_events')
    .insert({
      source: 'hubspot',
      event_type: body.event_type,
      payload_version: body.payload_version,
      external_event_id: externalEventId,
      external_object_id: body.external_object_id ?? null,
      hubspot_property_id: body.external_object_id ?? null,
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
      .eq('source', 'hubspot')
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
        } else if (row?.inspection_id && body.external_object_id) {
          // Persist external reference (decoupled — inspections table stays HubSpot-agnostic)
          try {
            const provider = 'hubspot';
            const externalObjectType = 'lease_contract';
            const externalObjectTypeId = '2-47492934';
            const objectIdStr = String(body.external_object_id);
            const inspectionIdStr = row.inspection_id as string;

            // A) Existing active reference for this exact pair on THIS inspection?
            const { data: existingForThis } = await supabase
              .from('inspection_external_references')
              .select('id')
              .eq('inspection_id', inspectionIdStr)
              .eq('provider', provider)
              .eq('external_object_type', externalObjectType)
              .eq('external_object_id', objectIdStr)
              .eq('is_active', true)
              .maybeSingle();

            if (existingForThis) {
              await supabase
                .from('inspection_external_references')
                .update({
                  metadata: {
                    external_event_id: externalEventId,
                    source_event_id: eventId,
                    received_at: new Date().toISOString(),
                  },
                })
                .eq('id', existingForThis.id);
            } else {
              // B) Deactivate any active reference for the same external object on a DIFFERENT inspection
              await supabase
                .from('inspection_external_references')
                .update({ is_active: false })
                .eq('provider', provider)
                .eq('external_object_type', externalObjectType)
                .eq('external_object_id', objectIdStr)
                .eq('is_active', true);

              // C) Insert the new active reference
              const { error: refInsErr } = await supabase
                .from('inspection_external_references')
                .insert({
                  inspection_id: inspectionIdStr,
                  provider,
                  external_object_type: externalObjectType,
                  external_object_type_id: externalObjectTypeId,
                  external_object_id: objectIdStr,
                  is_active: true,
                  metadata: {
                    external_event_id: externalEventId,
                    source_event_id: eventId,
                    received_at: new Date().toISOString(),
                  },
                });
              if (refInsErr) {
                console.error('[intake] external_reference insert failed', refInsErr);
              }
            }
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
