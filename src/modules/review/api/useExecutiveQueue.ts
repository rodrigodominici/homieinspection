/**
 * Executive Queue aggregated data.
 * Loads inspections + section metadata + inspector profiles in parallel,
 * returning a single bundle. Replaces ~3 useEffect+useState chains in the
 * ExecutiveReviewQueue page.
 */
import { useMemo } from "react";
import {
  useInspections,
  useProfilesByIds,
  useSectionsBulk,
} from "@/modules/inspection/api/useInspection";
import type { Inspection, Profile } from "@/lib/types";
import type { SectionMeta } from "@/modules/inspection/api/inspections.service";

export interface ExecutiveQueueBundle {
  inspections: Inspection[];
  sectionsByInspection: Record<string, SectionMeta[]>;
  inspectorProfiles: Record<string, Profile>;
  loading: boolean;
  error: unknown;
}

export function useExecutiveQueue(): ExecutiveQueueBundle {
  const insp = useInspections();

  const inspectionIds = useMemo(
    () => (insp.data ?? []).map((i) => i.id),
    [insp.data],
  );
  const inspectorIds = useMemo(
    () => [...new Set((insp.data ?? []).map((i) => i.inspector_id).filter(Boolean))] as string[],
    [insp.data],
  );

  const secs = useSectionsBulk(inspectionIds);
  const profs = useProfilesByIds(inspectorIds);

  const sectionsByInspection = useMemo(() => {
    const out: Record<string, SectionMeta[]> = {};
    for (const s of secs.data ?? []) {
      (out[s.inspection_id] ||= []).push(s);
    }
    return out;
  }, [secs.data]);

  const inspectorProfiles = useMemo(() => {
    const out: Record<string, Profile> = {};
    for (const p of profs.data ?? []) out[p.id] = p;
    return out;
  }, [profs.data]);

  return {
    inspections: insp.data ?? [],
    sectionsByInspection,
    inspectorProfiles,
    loading: insp.isLoading || secs.isLoading || profs.isLoading,
    error: insp.error ?? secs.error ?? profs.error,
  };
}
