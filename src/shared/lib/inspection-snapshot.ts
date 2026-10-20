import { supabase } from '@/integrations/supabase/client';
import { listQueue } from '@/shared/lib/offline-queue';

/**
 * Local copy of one inspection (sections, answers, photo rows, signature) so
 * the inspector screens can render without signal. Saved whenever the
 * inspection is opened online; queued offline edits are applied on top.
 */
export interface InspectionSnapshot {
  inspection: Record<string, unknown>;
  sections: Record<string, unknown>[];
  fields: Record<string, unknown>[];
  photos: Record<string, unknown>[];
  signature: Record<string, unknown> | null;
  savedAt: number;
}

const key = (id: string) => `homie:snap:${id}`;

export function isOffline() {
  return typeof navigator !== 'undefined' && !navigator.onLine;
}

/** Download everything for the inspection and keep it on the phone. */
export async function refreshSnapshot(inspectionId: string, inspection: Record<string, unknown>): Promise<boolean> {
  try {
    const [secs, fields, photos, sig] = await Promise.all([
      supabase.from('inspection_sections').select('*').eq('inspection_id', inspectionId).order('sort_order'),
      supabase.from('inspection_field_values').select('*').eq('inspection_id', inspectionId).order('sort_order'),
      supabase.from('inspection_photos').select('*').eq('inspection_id', inspectionId).order('sort_order'),
      supabase.from('inspection_signatures').select('signature_data, signature_status, signer_name, skip_reason').eq('inspection_id', inspectionId).order('created_at', { ascending: false }).limit(1),
    ]);
    if (secs.error || fields.error || photos.error) return false;
    const snap: InspectionSnapshot = {
      inspection,
      sections: secs.data ?? [],
      fields: fields.data ?? [],
      photos: photos.data ?? [],
      signature: (sig.data ?? [])[0] ?? null,
      savedAt: Date.now(),
    };
    localStorage.setItem(key(inspectionId), JSON.stringify(snap));
    return true;
  } catch { /* storage full or offline: keep previous copy */ return false; }
}

/** True when a local copy of this inspection exists on the phone. */
export function hasSnapshot(inspectionId: string): boolean {
  try { return !!localStorage.getItem(key(inspectionId)); } catch { return false; }
}

/** Read the local copy with pending offline edits applied. */
export async function readSnapshot(inspectionId: string): Promise<InspectionSnapshot | null> {
  let snap: InspectionSnapshot | null = null;
  try {
    const raw = localStorage.getItem(key(inspectionId));
    snap = raw ? (JSON.parse(raw) as InspectionSnapshot) : null;
  } catch { snap = null; }
  if (!snap) return null;
  try {
    for (const op of await listQueue()) {
      if (op.kind !== 'update') continue;
      const list = op.table === 'inspection_sections' ? snap.sections : snap.fields;
      const row = list.find((r) => r.id === op.rowId);
      if (row) Object.assign(row, op.patch);
    }
  } catch { /* ignore */ }
  return snap;
}
