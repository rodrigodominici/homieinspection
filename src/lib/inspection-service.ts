/**
 * Inspection creation service.
 *
 * Orchestrates the full creation flow:
 * 1. Store raw source event in `inspection_source_events`
 * 2. Normalize property snapshot (immutable at creation time)
 * 3. Generate dynamic sections from payload rules
 * 4. Create parent `inspections` record with:
 *    - property_snapshot_json
 *    - inspector_id   (assigned at creation time by admin or resolved from HubSpot)
 *    - executive_id   (assigned at creation time by admin or resolved from HubSpot)
 *    - status = 'assigned' if both IDs present, else 'pending_assignment'
 * 5. Create concrete `inspection_sections` rows
 * 6. Create `inspection_field_values` for each section
 * 7. Mark source event as completed
 *
 * IMPORTANT: `executive_id` is set HERE during creation. It must not be null
 * when the inspection reaches the review stage, otherwise the executive
 * RLS policies will block access.
 */

import { supabase } from '@/integrations/supabase/client';
import { generateSections, normalizePropertySnapshot } from './inspection-generator';
import type { PropertyPayload } from './types';
import type { Json } from '@/integrations/supabase/types';

export async function createInspectionFromPayload(
  payload: PropertyPayload,
  createdBy: string
) {
  // 1. Save raw source event
  const { data: sourceEvent, error: sourceError } = await supabase
    .from('inspection_source_events')
    .insert({
      source: 'manual',
      hubspot_property_id: payload.hubspot_property_id ?? null,
      payload_json: payload as unknown as Json,
      processing_status: 'processing',
    })
    .select()
    .single();

  if (sourceError) throw new Error(`Source event error: ${sourceError.message}`);

  // 2. Normalize property snapshot
  const snapshot = normalizePropertySnapshot(payload);

  // 3. Generate sections
  const generatedSections = generateSections(payload);

  // 4. Resolve inspector and executive IDs
  const inspectorId = payload.inspector?.id || null;
  const executiveId = payload.executive?.id || null;

  /**
   * STATUS LOGIC:
   * - If both inspector and executive are assigned → 'assigned'
   * - Otherwise → 'pending_assignment' (admin must resolve manually)
   */
  const hasValidInspector = inspectorId && inspectorId !== 'REPLACE_WITH_REAL_ID';
  const hasValidExecutive = executiveId && executiveId !== 'REPLACE_WITH_REAL_ID';
  const status = hasValidInspector && hasValidExecutive ? 'assigned' : 'pending_assignment';

  // 5. Create parent inspection
  const { data: inspection, error: inspError } = await supabase
    .from('inspections')
    .insert({
      source_event_id: sourceEvent.id,
      property_id: payload.property_id,
      market: payload.market,
      property_name: payload.property_name ?? null,
      address: payload.address ?? null,
      typology: payload.typology ?? null,
      property_type: payload.property_type ?? null,
      inspection_type: payload.inspection_type,
      hubspot_property_id: payload.hubspot_property_id ?? null,
      inspector_id: hasValidInspector ? inspectorId : null,
      executive_id: hasValidExecutive ? executiveId : null,
      status,
      scheduled_at: payload.scheduled_at ?? null,
      property_snapshot_json: snapshot as unknown as Json,
      generated_structure_json: { sections: generatedSections } as unknown as Json,
      created_by: createdBy,
    })
    .select()
    .single();

  if (inspError) throw new Error(`Inspection error: ${inspError.message}`);

  // 6. Create concrete sections
  for (const section of generatedSections) {
    const { data: sectionData, error: secError } = await supabase
      .from('inspection_sections')
      .insert({
        inspection_id: inspection.id,
        section_key: section.section_key,
        section_title: section.section_title,
        section_type: section.section_type,
        sort_order: section.sort_order,
        status: 'not_started',
      })
      .select()
      .single();

    if (secError) throw new Error(`Section error: ${secError.message}`);

    // 7. Create field values
    if (section.fields.length > 0) {
      const fieldRows = section.fields.map((f) => ({
        inspection_id: inspection.id,
        inspection_section_id: sectionData.id,
        field_key: f.field_key,
        field_label: f.field_label,
        field_type: f.field_type,
        group_key: f.group_key,
        sort_order: f.sort_order,
        is_visible: true,
        value_json: f.options_json ? ({ options: f.options_json } as unknown as Json) : null,
      }));

      const { error: fieldError } = await supabase
        .from('inspection_field_values')
        .insert(fieldRows);

      if (fieldError) throw new Error(`Field values error: ${fieldError.message}`);
    }
  }

  // 8. Mark source event as completed
  await supabase
    .from('inspection_source_events')
    .update({ processing_status: 'completed', processed_at: new Date().toISOString() })
    .eq('id', sourceEvent.id);

  return inspection;
}
