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
