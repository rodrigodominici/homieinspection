/**
 * Shared React Query hook for inspector list views (Dashboard, All, Past, Calendar).
 *
 * Fetches inspections with column projection (INSPECTION_LIST_COLUMNS) and
 * optionally batch-loads sections for progress calculation. Cached across
 * routes so navigating dashboard → detail → dashboard does NOT re-fetch.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { INSPECTION_LIST_COLUMNS } from '@/lib/inspection-columns';
import type { Inspection, InspectionSection } from '@/lib/types';

type SectionLite = Pick<InspectionSection, 'status' | 'is_visible' | 'section_type'> & {
  id: string;
  inspection_id: string;
};

export interface InspectorInspectionsOptions {
  /** Filter by inspection.status with `.in(...)`. Omit for all statuses. */
  statuses?: string[];
  /** Order by column. Default 'updated_at' descending. */
  orderBy?: 'updated_at' | 'completed_at';
  /** Skip the sections batch fetch (e.g. past inspections list). */
  includeSections?: boolean;
}

export interface InspectorInspectionsResult {
  inspections: Inspection[];
  sectionsByInspection: Record<string, SectionLite[]>;
  loading: boolean;
}

export const inspectorInspectionsKey = (opts: InspectorInspectionsOptions = {}) =>
  [
    'inspector-inspections',
    opts.statuses?.slice().sort().join(',') ?? 'all',
    opts.orderBy ?? 'updated_at',
    opts.includeSections === false ? 'no-sections' : 'with-sections',
  ] as const;

async function fetchInspectorInspections(
  opts: InspectorInspectionsOptions,
): Promise<{ inspections: Inspection[]; sectionsByInspection: Record<string, SectionLite[]> }> {
  let q = supabase.from('inspections').select(INSPECTION_LIST_COLUMNS);
  if (opts.statuses && opts.statuses.length > 0) {
    q = q.in('status', opts.statuses);
  }
  q = q.order(opts.orderBy ?? 'updated_at', { ascending: false });

  const { data } = await q;
  const inspections = (data ?? []) as unknown as Inspection[];

  if (opts.includeSections === false || inspections.length === 0) {
    return { inspections, sectionsByInspection: {} };
  }

  const ids = inspections.map((i) => i.id);
  const { data: allSections } = await supabase
    .from('inspection_sections')
    .select('id, inspection_id, status, is_visible, section_type')
    .in('inspection_id', ids);

  const sectionsByInspection = ((allSections ?? []) as unknown as SectionLite[]).reduce<
    Record<string, SectionLite[]>
  >((acc, s) => {
    (acc[s.inspection_id] ??= []).push(s);
    return acc;
  }, {});

  return { inspections, sectionsByInspection };
}

export function useInspectorInspections(
  opts: InspectorInspectionsOptions = {},
): InspectorInspectionsResult {
  const query = useQuery({
    queryKey: inspectorInspectionsKey(opts),
    queryFn: () => fetchInspectorInspections(opts),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });

  return {
    inspections: query.data?.inspections ?? [],
    sectionsByInspection: query.data?.sectionsByInspection ?? {},
    loading: query.isLoading,
  };
}
