// Shared intake rules for HubSpot and Rent Manager sources.
export type IntakeSource = 'hubspot' | 'rent_manager';
export const INTAKE_SOURCES: IntakeSource[] = ['hubspot', 'rent_manager'];

export function timingSafeEqual(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function isIntakeSource(v: unknown): v is IntakeSource {
  return v === 'hubspot' || v === 'rent_manager';
}

/** Each source is checked only against its own secret. */
export function isAuthorizedForSource(source: unknown, provided: string, secrets: { hubspot: string; rent_manager: string }) {
  if (!isIntakeSource(source)) return false;
  return timingSafeEqual(provided, secrets[source] ?? '');
}

/** Rent Manager sends fecha_tentativa_recepcion; it becomes scheduled_at when scheduled_at is absent. */
export function applySourceDefaults(source: IntakeSource, data: any) {
  if (source !== 'rent_manager' || !data || typeof data !== 'object') return data;
  const fecha = data.fecha_tentativa_recepcion;
  if (!data.scheduled_at && typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return { ...data, scheduled_at: fecha };
  }
  return data;
}

export type ReferenceSpec = {
  provider: IntakeSource;
  external_object_type: string;
  external_object_type_id: string | null;
  external_object_id: string;
  extraMetadata: Record<string, unknown>;
};

export function buildReferenceSpec(
  source: IntakeSource,
  externalObjectId: unknown,
  body: any,
  inspection: { inspection_type?: string | null; market?: string | null } | null,
): ReferenceSpec | null {
  if (externalObjectId === undefined || externalObjectId === null || externalObjectId === '') return null;
  const id = String(externalObjectId);
  if (source === 'rent_manager') {
    return {
      provider: 'rent_manager',
      external_object_type: 'captacion',
      external_object_type_id: null,
      external_object_id: id,
      extraMetadata: { rm_inspection_id: body?.data?.rm_inspection_id ?? null },
    };
  }
  // Unchanged HubSpot rule: top-level captacion, or MX captación detected on the created inspection.
  const isCaptacion = body?.inspection_type === 'captacion'
    || (inspection?.inspection_type === 'captacion' && inspection?.market === 'MX');
  return {
    provider: 'hubspot',
    external_object_type: isCaptacion ? 'deal' : 'lease_contract',
    external_object_type_id: isCaptacion ? '0-3' : '2-47492934',
    external_object_id: id,
    extraMetadata: {},
  };
}

/** Creates or refreshes the active external reference for a created inspection. */
export async function upsertExternalReference(
  supabase: any,
  params: { inspectionId: string; source: IntakeSource; body: any; externalObjectId: unknown; externalEventId: string | null; sourceEventId: string },
) {
  const { data: insp } = await supabase
    .from('inspections').select('inspection_type, market').eq('id', params.inspectionId).maybeSingle();
  const spec = buildReferenceSpec(params.source, params.externalObjectId, params.body, insp);
  if (!spec) return;
  const metadata = {
    ...spec.extraMetadata,
    external_event_id: params.externalEventId,
    source_event_id: params.sourceEventId,
    received_at: new Date().toISOString(),
  };
  const { data: existing } = await supabase
    .from('inspection_external_references').select('id')
    .eq('inspection_id', params.inspectionId).eq('provider', spec.provider)
    .eq('external_object_type', spec.external_object_type).eq('external_object_id', spec.external_object_id)
    .eq('is_active', true).maybeSingle();
  if (existing) {
    await supabase.from('inspection_external_references').update({ metadata }).eq('id', existing.id);
    return;
  }
  await supabase.from('inspection_external_references').update({ is_active: false })
    .eq('provider', spec.provider).eq('external_object_type', spec.external_object_type)
    .eq('external_object_id', spec.external_object_id).eq('is_active', true);
  const { error } = await supabase.from('inspection_external_references').insert({
    inspection_id: params.inspectionId,
    provider: spec.provider,
    external_object_type: spec.external_object_type,
    external_object_type_id: spec.external_object_type_id,
    external_object_id: spec.external_object_id,
    is_active: true,
    metadata,
  });
  if (error) console.error('[intake] external_reference insert failed', error);
}

/** Used by retry/recovery: link the inspection once the RPC succeeds. */
export async function linkReferenceForEvent(supabase: any, eventId: string, inspectionId: string | null | undefined) {
  if (!inspectionId) return;
  const { data: ev } = await supabase
    .from('inspection_source_events')
    .select('id, source, external_event_id, external_object_id, payload_json')
    .eq('id', eventId).maybeSingle();
  if (!ev || !isIntakeSource(ev.source)) return;
  await upsertExternalReference(supabase, {
    inspectionId, source: ev.source, body: ev.payload_json ?? {},
    externalObjectId: ev.external_object_id, externalEventId: ev.external_event_id, sourceEventId: ev.id,
  });
}
