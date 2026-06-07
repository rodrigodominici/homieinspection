/**
 * Loads the latest owner-audience report version + per-repair feedback rows
 * and exposes them as a Map keyed by `repair_item_id`. This lets every
 * executive editing surface (Cotización, Reparaciones, panel por sección)
 * mostrar inline qué reparaciones tienen observación/rechazo del propietario.
 *
 * Comparte caché entre tabs vía React Query (key: ['owner-feedback', id]).
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type OwnerDecision = 'accepted' | 'observed' | 'rejected';

export interface OwnerFeedbackEntry {
  decision: OwnerDecision;
  comment: string | null;
  submitterName: string | null;
  submittedAt: string;
}

export interface UseOwnerFeedbackResult {
  feedbackByRepairId: Map<string, OwnerFeedbackEntry>;
  versionNumber: number | null;
  versionId: string | null;
  pendingCount: number;
  acceptedCount: number;
  totalCount: number;
  hasPendingFeedback: boolean;
  loading: boolean;
}

const EMPTY: UseOwnerFeedbackResult = {
  feedbackByRepairId: new Map(),
  versionNumber: null,
  versionId: null,
  pendingCount: 0,
  acceptedCount: 0,
  totalCount: 0,
  hasPendingFeedback: false,
  loading: false,
};

async function fetchOwnerFeedback(inspectionId: string) {
  const { data: v } = await supabase
    .from('inspection_report_versions')
    .select('id, version_number')
    .eq('inspection_id', inspectionId)
    .eq('audience', 'owner')
    .eq('is_latest', true)
    .maybeSingle();
  if (!v) return { version: null, rows: [] as any[] };
  const { data: rows } = await supabase
    .from('inspection_owner_feedback')
    .select('repair_item_id, decision, comment, submitter_name, submitted_at')
    .eq('report_version_id', (v as any).id)
    .order('submitted_at', { ascending: true });
  return { version: v as any, rows: (rows ?? []) as any[] };
}

export function useOwnerFeedbackByRepair(inspectionId: string | undefined): UseOwnerFeedbackResult {
  const query = useQuery({
    queryKey: ['owner-feedback', inspectionId],
    queryFn: () => fetchOwnerFeedback(inspectionId!),
    enabled: !!inspectionId,
    staleTime: 30_000,
  });

  return useMemo<UseOwnerFeedbackResult>(() => {
    if (!query.data) return { ...EMPTY, loading: query.isLoading };
    const { version, rows } = query.data;
    const map = new Map<string, OwnerFeedbackEntry>();
    let pending = 0;
    let accepted = 0;
    for (const r of rows) {
      map.set(r.repair_item_id, {
        decision: r.decision,
        comment: r.comment ?? null,
        submitterName: r.submitter_name ?? null,
        submittedAt: r.submitted_at,
      });
      if (r.decision === 'accepted') accepted += 1;
      else pending += 1;
    }
    return {
      feedbackByRepairId: map,
      versionNumber: version?.version_number ?? null,
      versionId: version?.id ?? null,
      pendingCount: pending,
      acceptedCount: accepted,
      totalCount: rows.length,
      hasPendingFeedback: pending > 0,
      loading: query.isLoading,
    };
  }, [query.data, query.isLoading]);
}
