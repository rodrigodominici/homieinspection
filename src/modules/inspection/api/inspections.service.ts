/**
 * Inspections data access layer.
 * Pages MUST consume these instead of calling supabase.from('inspections')
 * directly. This keeps RLS-aware queries in one place and unlocks react-query
 * cache + invalidation.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  CONTRACTOR_COLUMNS,
  INSPECTION_DETAIL_COLUMNS,
  INSPECTION_LIST_COLUMNS,
  SECTION_COLUMNS,
} from "@/lib/inspection-columns";
import type { Inspection, InspectionSection, Profile } from "@/lib/types";

export interface SectionMeta {
  inspection_id: string;
  status: string;
  is_visible: boolean;
  section_type: string;
  final_observation: string | null;
}

export async function listInspections(): Promise<Inspection[]> {
  const { data, error } = await supabase
    .from("inspections")
    .select(INSPECTION_LIST_COLUMNS)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Inspection[];
}

export async function getInspectionById(id: string): Promise<Inspection | null> {
  const { data, error } = await supabase
    .from("inspections")
    .select(INSPECTION_DETAIL_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as unknown as Inspection | null;
}

export async function listSectionsForInspections(inspectionIds: string[]): Promise<SectionMeta[]> {
  if (inspectionIds.length === 0) return [];
  const { data, error } = await supabase
    .from("inspection_sections")
    .select("inspection_id, status, is_visible, section_type, final_observation")
    .in("inspection_id", inspectionIds);
  if (error) throw error;
  return (data ?? []) as SectionMeta[];
}

export async function listSectionsForInspection(inspectionId: string): Promise<InspectionSection[]> {
  const { data, error } = await supabase
    .from("inspection_sections")
    .select(SECTION_COLUMNS)
    .eq("inspection_id", inspectionId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as InspectionSection[];
}

export async function listProfilesByIds(ids: string[]): Promise<Profile[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, role")
    .in("id", ids);
  if (error) throw error;
  return (data ?? []) as unknown as Profile[];
}
