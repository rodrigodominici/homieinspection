/**
 * Inspection status consistency guard.
 *
 * Ensures the parent inspection status stays coherent with section progress.
 * Called after any section status change (e.g. marking a section complete).
 *
 * Rules:
 * - If any section has moved beyond `not_started` and inspection is still
 *   `pending` or `assigned`, auto-transition to `in_progress`.
 * - Does NOT auto-submit — only explicit inspector action does that.
 */

import { supabase } from '@/integrations/supabase/client';

const STALE_STATUSES = new Set(['pending', 'assigned', 'pending_assignment']);
const ACTIVE_SECTION_STATUSES = new Set(['in_progress', 'completed', 'reviewed', 'needs_changes']);

/**
 * Status set in which the inspector can no longer edit fields, photos,
 * or section completion. Signature must remain visible.
 *
 * - `submitted`: sent to executive review (terminal for inspector).
 * - `in_review` / `reviewed` / `approved` / `published`: post-inspector workflow stages.
 * - `sent`: legacy historical terminal status (kept for safety, no new writes).
 */
const READ_ONLY_STATUSES = new Set([
  'submitted',
  'in_review',
  'reviewed',
  'approved',
  'published',
  'sent',
]);

/**
 * Whether the inspector should see the inspection as read-only.
 * Centralized so all inspector pages share one source of truth.
 */
export function isInspectorReadOnly(status: string | null | undefined): boolean {
  if (!status) return false;
  return READ_ONLY_STATUSES.has(status);
}

/**
 * Call this after updating any section status.
 * It reads current inspection + all sections and fixes stale parent status.
 */
export async function ensureInspectionStatusConsistency(inspectionId: string): Promise<string | null> {
  const { data: inspection } = await supabase
    .from('inspections')
    .select('status')
    .eq('id', inspectionId)
    .single();

  if (!inspection) return null;

  // Only fix if inspection is in a stale state
  if (!STALE_STATUSES.has(inspection.status)) return inspection.status;

  const { data: sections } = await supabase
    .from('inspection_sections')
    .select('status')
    .eq('inspection_id', inspectionId)
    .eq('is_visible', true);

  if (!sections || sections.length === 0) return inspection.status;

  const hasActiveSections = sections.some((s) => ACTIVE_SECTION_STATUSES.has(s.status));

  if (hasActiveSections) {
    const newStatus = 'in_progress';
    await supabase
      .from('inspections')
      .update({ status: newStatus, started_at: new Date().toISOString() })
      .eq('id', inspectionId);
    return newStatus;
  }

  return inspection.status;
}
