// Best-effort, non-blocking client triggers for the outbound HubSpot sync.
// All UI surfaces that mutate HubSpot-bound fields go through this helper so
// the trigger source stays consistent (and so we have one place to add retries
// or telemetry later).
import { supabase } from '@/integrations/supabase/client';

type SyncResult = { ok: boolean; error?: unknown };

async function invoke(body: Record<string, unknown>): Promise<SyncResult> {
  try {
    const { data, error } = await supabase.functions.invoke('hubspot-update-inspection', { body });
    if (error) {
      console.warn('[hubspot-sync] invoke failed', body, error);
      return { ok: false, error };
    }
    return { ok: true, ...(typeof data === 'object' ? data : {}) };
  } catch (err) {
    console.warn('[hubspot-sync] threw', body, err);
    return { ok: false, error: err };
  }
}

export function triggerKeyCollectionSync(inspectionId: string): Promise<SyncResult> {
  return invoke({ inspection_id: inspectionId, action: 'key_collection_date' });
}

export function triggerCheckoutSync(inspectionId: string, eventTimeIso: string): Promise<SyncResult> {
  return invoke({ inspection_id: inspectionId, action: 'checkout_received', event_time: eventTimeIso });
}

/**
 * Centralized, transition-based gate for the `checkout_received` outbound sync.
 *
 * Fires `triggerCheckoutSync` only when the inspection transitions INTO `submitted`
 * for the first time (previousStatus !== 'submitted' && newStatus === 'submitted').
 *
 * Returns `null` for any non-applicable transition (re-saves of an already-submitted
 * inspection, downstream states like `in_review` / `approved` / `published`, or
 * transitions that do not land on `submitted`). Always non-blocking — never throws.
 *
 * Callers should pass the same `eventTimeIso` they used to stamp
 * `inspection_completed_at` so the HubSpot business event time is consistent.
 */
export async function syncCheckoutIfApplicable(opts: {
  inspectionId: string;
  previousStatus: string | null;
  newStatus: string;
  eventTimeIso: string;
}): Promise<SyncResult | null> {
  const { inspectionId, previousStatus, newStatus, eventTimeIso } = opts;
  if (newStatus !== 'submitted') return null;
  if (previousStatus === 'submitted') return null;
  return triggerCheckoutSync(inspectionId, eventTimeIso);
}
