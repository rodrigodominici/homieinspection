/**
 * Inspection creation service (optimized).
 *
 * Replaces the previous N+1 sequential inserts with a single RPC call
 * `create_inspection_from_event`, which performs all inserts (inspection +
 * sections + field values) inside ONE transaction with bulk inserts.
 *
 * Flow:
 * 1. Persist a source event (manual) carrying the normalized payload AND
 *    the pre-computed generated structure under `__generated__`.
 * 2. Call the RPC; it transitions the event to `completed` and returns the
 *    new inspection id.
 * 3. Fetch and return the freshly created inspection row.
 *
 * Both the manual-creation path (admin UI) and the HubSpot intake edge
 * function reuse the same RPC, guaranteeing parity.
 */

import { supabase } from '@/integrations/supabase/client';
import { generateSections, normalizePropertySnapshot } from './inspection-generator';
import type { PropertyPayload } from './types';
import type { Json } from '@/integrations/supabase/types';

export interface ExternalObjectRef {
  /** ID numérico del objeto en HubSpot (contrato de locación o deal). */
  externalObjectId: string;
}

const HUBSPOT_OBJECT_MAP = {
  captacion: { type: 'deal', typeId: '0-3' },
  check_out: { type: 'lease_contract', typeId: '2-47492934' },
} as const;

export async function createInspectionFromPayload(
  payload: PropertyPayload,
  createdBy: string,
  externalRef?: ExternalObjectRef,
) {

  // 1. Build normalized payload with embedded generated structure & snapshot.
  const snapshot = normalizePropertySnapshot(payload);
  const generatedStructure = { sections: generateSections(payload) };

  const inspectorId = payload.inspector?.id || null;
  const executiveId = payload.executive?.id || null;
  const hasValidInspector = inspectorId && inspectorId !== 'REPLACE_WITH_REAL_ID';
  const hasValidExecutive = executiveId && executiveId !== 'REPLACE_WITH_REAL_ID';

  const normalized = {
    ...payload,
    inspector: hasValidInspector ? payload.inspector : undefined,
    executive: hasValidExecutive ? payload.executive : undefined,
    __snapshot__: snapshot,
    __generated__: generatedStructure,
  };

  // 2. Persist source event (status `received` so the RPC can pick it up).
  const { data: sourceEvent, error: sourceError } = await supabase
    .from('inspection_source_events')
    .insert({
      source: 'manual',
      event_type: 'inspection.create',
      payload_version: 'v1',
      hubspot_property_id: payload.hubspot_property_id ?? null,
      external_object_id: payload.hubspot_property_id ?? null,
      payload_json: payload as unknown as Json,
      normalized_payload_json: normalized as unknown as Json,
      processing_status: 'processing',
      processing_started_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (sourceError || !sourceEvent) {
    throw new Error(`Source event error: ${sourceError?.message ?? 'unknown'}`);
  }

  // 3. Single-RPC creation.
  const { data: rpcResult, error: rpcError } = await supabase.rpc(
    'create_inspection_from_event',
    { p_event_id: sourceEvent.id },
  );

  if (rpcError) throw new Error(`Inspection RPC error: ${rpcError.message}`);
  const row = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;
  if (!row?.inspection_id || row.failure_reason) {
    throw new Error(`Inspection creation failed: ${row?.error_detail ?? 'unknown'}`);
  }

  // 4. Stamp created_by (RPC does not have auth context).
  await supabase
    .from('inspections')
    .update({ created_by: createdBy })
    .eq('id', row.inspection_id);

  // 4b. Registrar la referencia externa de HubSpot (habilita el sync bidireccional).
  //     Misma lógica que el intake automático: se desactiva cualquier referencia
  //     activa previa del mismo objeto en otra inspección.
  const externalObjectId = externalRef?.externalObjectId?.trim();
  if (externalObjectId) {
    const map =
      payload.inspection_type === 'captacion'
        ? HUBSPOT_OBJECT_MAP.captacion
        : HUBSPOT_OBJECT_MAP.check_out;

    await supabase
      .from('inspection_external_references')
      .update({ is_active: false })
      .eq('provider', 'hubspot')
      .eq('external_object_type', map.type)
      .eq('external_object_id', externalObjectId)
      .eq('is_active', true);

    const { error: refError } = await supabase
      .from('inspection_external_references')
      .insert({
        inspection_id: row.inspection_id as string,
        provider: 'hubspot',
        external_object_type: map.type,
        external_object_type_id: map.typeId,
        external_object_id: externalObjectId,
        is_active: true,
        metadata: {
          source: 'manual_admin',
          source_event_id: sourceEvent.id,
          created_at: new Date().toISOString(),
        } as unknown as Json,
      });
    if (refError) {
      throw new Error(`No se pudo registrar la referencia de HubSpot: ${refError.message}`);
    }
  }



  const { data: inspection, error: fetchError } = await supabase
    .from('inspections')
    .select('*')
    .eq('id', row.inspection_id)
    .single();

  if (fetchError) throw new Error(`Inspection fetch error: ${fetchError.message}`);
  return inspection;
}
