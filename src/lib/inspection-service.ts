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

export async function createInspectionFromPayload(
  payload: PropertyPayload,
  createdBy: string,
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

  const { data: inspection, error: fetchError } = await supabase
    .from('inspections')
    .select('*')
    .eq('id', row.inspection_id)
    .single();

  if (fetchError) throw new Error(`Inspection fetch error: ${fetchError.message}`);
  return inspection;
}
