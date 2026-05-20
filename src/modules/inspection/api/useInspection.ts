import { useQuery } from "@tanstack/react-query";
import {
  getInspectionById,
  listInspections,
  listProfilesByIds,
  listSectionsForInspection,
  listSectionsForInspections,
  type SectionMeta,
} from "./inspections.service";
import type { Inspection, InspectionSection, Profile } from "@/lib/types";

export const inspectionKeys = {
  all:      ["inspections"] as const,
  list:     () => [...inspectionKeys.all, "list"] as const,
  detail:   (id: string) => [...inspectionKeys.all, "detail", id] as const,
  sections: (id: string) => [...inspectionKeys.all, id, "sections"] as const,
  sectionsBulk: (ids: string[]) =>
    [...inspectionKeys.all, "sections-bulk", ids.slice().sort().join(",")] as const,
  profiles: (ids: string[]) =>
    ["profiles", "by-ids", ids.slice().sort().join(",")] as const,
};

/** All inspections the current user can see (RLS-filtered). */
export function useInspections() {
  return useQuery<Inspection[]>({
    queryKey: inspectionKeys.list(),
    queryFn: listInspections,
    staleTime: 30_000,
  });
}

export function useInspection(id: string | undefined) {
  return useQuery<Inspection | null>({
    queryKey: id ? inspectionKeys.detail(id) : ["inspection", "undefined"],
    queryFn: () => getInspectionById(id as string),
    enabled: !!id,
    staleTime: 15_000,
  });
}

export function useInspectionSections(id: string | undefined) {
  return useQuery<InspectionSection[]>({
    queryKey: id ? inspectionKeys.sections(id) : ["sections", "undefined"],
    queryFn: () => listSectionsForInspection(id as string),
    enabled: !!id,
    staleTime: 15_000,
  });
}

/** Aggregated section metadata across many inspections (queue/list views). */
export function useSectionsBulk(inspectionIds: string[]) {
  return useQuery<SectionMeta[]>({
    queryKey: inspectionKeys.sectionsBulk(inspectionIds),
    queryFn: () => listSectionsForInspections(inspectionIds),
    enabled: inspectionIds.length > 0,
    staleTime: 30_000,
  });
}

export function useProfilesByIds(ids: string[]) {
  return useQuery<Profile[]>({
    queryKey: inspectionKeys.profiles(ids),
    queryFn: () => listProfilesByIds(ids),
    enabled: ids.length > 0,
    staleTime: 5 * 60_000,
  });
}
