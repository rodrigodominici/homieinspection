/**
 * Fire-and-forget helper to emit a system communication event.
 * The edge function evaluates active rules, resolves recipients, and writes
 * a row to `communication_deliveries` for full traceability.
 *
 * Never blocks the caller; failures are logged to console only.
 */
import { supabase } from '@/integrations/supabase/client';
import type { CommunicationEventName } from './events';

export interface EmitCommunicationEventArgs {
  eventName: CommunicationEventName;
  inspectionId: string;
  payload?: Record<string, unknown>;
}

export function emitCommunicationEvent(args: EmitCommunicationEventArgs): void {
  // intentionally not awaited
  void supabase.functions
    .invoke('process-communication-event', {
      body: {
        event_name: args.eventName,
        inspection_id: args.inspectionId,
        payload: args.payload ?? {},
      },
    })
    .then(({ error }) => {
      if (error) {
        console.warn('[communications] emit failed', args.eventName, error);
      }
    })
    .catch((err) => {
      console.warn('[communications] emit threw', args.eventName, err);
    });
}
