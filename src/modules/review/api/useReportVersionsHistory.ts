/**
 * Loads the full history of published report versions (owner audience) for
 * an inspection, with the executive name that published each one.
 *
 * Used by the executive Publish view to show a timeline of every quotation
 * generated through publish/republish, with read-only access to old snapshots.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ReportVersionHistoryEntry {
  id: string;
  version_number: number;
  created_at: string;
  is_latest: boolean;
  published_by: string | null;
  published_by_name: string | null;
  normalized_payload: any;
  owner_decision_summary_json: any;
  approved_by_name: string | null;
  approved_at: string | null;
  approval_kind: 'owner' | 'manual' | null;
}

async function fetchHistory(inspectionId: string): Promise<ReportVersionHistoryEntry[]> {
  const { data: versions, error } = await supabase
    .from('inspection_report_versions')
    .select('id, version_number, created_at, is_latest, published_by, normalized_payload, owner_decision_summary_json')
    .eq('inspection_id', inspectionId)
    .eq('audience', 'owner')
    .order('version_number', { ascending: false });
  if (error) throw error;
  const rows = (versions ?? []) as any[];

  const ids = Array.from(new Set(rows.map((r) => r.published_by).filter(Boolean))) as string[];
  let nameById = new Map<string, string>();
  if (ids.length > 0) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', ids);
    nameById = new Map((profs ?? []).map((p: any) => [p.id, p.full_name || p.email || 'Ejecutivo']));
  }

  // Approval evidence per version (last accepted submission)
  const versionIds = rows.map((r) => r.id);
  const approvalByVersion = new Map<string, { name: string | null; at: string; kind: 'owner' | 'manual' }>();
  if (versionIds.length > 0) {
    const { data: subs } = await supabase
      .from('inspection_owner_feedback_submissions')
      .select('report_version_id, submitter_name, submitted_at, all_accepted, summary_json')
      .in('report_version_id', versionIds)
      .eq('all_accepted', true)
      .order('submitted_at', { ascending: false });
    for (const s of (subs ?? []) as any[]) {
      if (approvalByVersion.has(s.report_version_id)) continue;
      const manual = !!s.summary_json?.manual_closure;
      approvalByVersion.set(s.report_version_id, {
        name: manual ? (s.summary_json?.closed_by_name ?? null) : (s.submitter_name ?? null),
        at: s.submitted_at,
        kind: manual ? 'manual' : 'owner',
      });
    }
  }

  return rows.map((r) => {
    const ap = approvalByVersion.get(r.id) ?? null;
    return {
      id: r.id,
      version_number: r.version_number,
      created_at: r.created_at,
      is_latest: r.is_latest,
      published_by: r.published_by ?? null,
      published_by_name: r.published_by ? (nameById.get(r.published_by) ?? null) : null,
      normalized_payload: r.normalized_payload,
      owner_decision_summary_json: r.owner_decision_summary_json,
      approved_by_name: ap?.name ?? null,
      approved_at: ap?.at ?? null,
      approval_kind: ap?.kind ?? null,
    };
  });
}


export function useReportVersionsHistory(inspectionId: string | undefined) {
  return useQuery({
    queryKey: ['report-versions', inspectionId],
    queryFn: () => fetchHistory(inspectionId!),
    enabled: !!inspectionId,
    staleTime: 60_000,
  });
}
