/**
 * Capa de datos de la sección "Inmuebles".
 *
 * No hay tabla de inmuebles: la unidad de agrupación es `inspections.property_id`.
 * Aquí agrupamos las inspecciones por inmueble y exponemos lo necesario para la
 * línea de tiempo y la comparación lado a lado entre dos momentos.
 */
import { supabase } from '@/integrations/supabase/client';
import { INSPECTION_LIST_COLUMNS } from '@/lib/inspection-columns';
import { getEffectiveSnapshot } from '@/lib/inspection-utils';
import { normalizeInspectionType, type CanonicalInspectionType } from '@/lib/inspection-type-labels';
import type { Inspection } from '@/lib/types';

export interface PropertySummary {
  property_id: string;
  property_name: string | null;
  address: string | null;
  property_type: string | null;
  market: string;
  /** Inspecciones del inmueble, de la más reciente a la más antigua. */
  inspections: Inspection[];
  countsByType: Record<CanonicalInspectionType, number>;
  lastActivityAt: string;
  /** Snapshot efectivo de la inspección más reciente (datos del inmueble). */
  snapshot: Record<string, unknown>;
}

const eventDate = (i: Inspection): string =>
  i.inspection_completed_at ?? i.completed_at ?? i.scheduled_at ?? i.created_at;

export async function listPropertyInspections(): Promise<Inspection[]> {
  const { data, error } = await supabase
    .from('inspections')
    .select(INSPECTION_LIST_COLUMNS)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Inspection[];
}

export function groupByProperty(inspections: Inspection[]): PropertySummary[] {
  const map = new Map<string, Inspection[]>();
  for (const i of inspections) {
    const key = i.property_id;
    if (!key) continue;
    const list = map.get(key);
    if (list) list.push(i);
    else map.set(key, [i]);
  }

  const summaries: PropertySummary[] = [];
  for (const [property_id, list] of map) {
    const sorted = [...list].sort(
      (a, b) => new Date(eventDate(b)).getTime() - new Date(eventDate(a)).getTime(),
    );
    const latest = sorted[0];
    const counts: Record<CanonicalInspectionType, number> = {
      check_out: 0,
      captacion: 0,
      check_in: 0,
    };
    for (const i of sorted) counts[normalizeInspectionType(i.inspection_type)] += 1;

    summaries.push({
      property_id,
      property_name: latest.property_name,
      address: latest.address,
      property_type: latest.property_type,
      market: latest.market,
      inspections: sorted,
      countsByType: counts,
      lastActivityAt: sorted
        .map((i) => i.updated_at)
        .sort()
        .reverse()[0],
      snapshot: getEffectiveSnapshot(latest),
    });
  }

  return summaries.sort(
    (a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime(),
  );
}

export async function listInspectionsByProperty(propertyId: string): Promise<Inspection[]> {
  const { data, error } = await supabase
    .from('inspections')
    .select(INSPECTION_LIST_COLUMNS)
    .eq('property_id', propertyId);
  if (error) throw error;
  const list = (data ?? []) as unknown as Inspection[];
  return list.sort((a, b) => new Date(eventDate(b)).getTime() - new Date(eventDate(a)).getTime());
}

export interface ComparableSection {
  id: string;
  inspection_id: string;
  section_key: string;
  section_title: string;
  section_type: string;
  sort_order: number;
  status: string;
  is_visible: boolean;
  final_observation: string | null;
  photoCount: number;
}

/** Secciones visibles (con conteo de fotos) de una o dos inspecciones a comparar. */
export async function listComparableSections(
  inspectionIds: string[],
): Promise<ComparableSection[]> {
  if (inspectionIds.length === 0) return [];

  const [sectionsRes, photosRes] = await Promise.all([
    supabase
      .from('inspection_sections')
      .select('id, inspection_id, section_key, section_title, section_type, sort_order, status, is_visible, final_observation')
      .in('inspection_id', inspectionIds)
      .eq('is_visible', true)
      .order('sort_order', { ascending: true }),
    supabase
      .from('inspection_photos')
      .select('inspection_section_id')
      .in('inspection_id', inspectionIds),
  ]);

  if (sectionsRes.error) throw sectionsRes.error;
  if (photosRes.error) throw photosRes.error;

  const photoCounts = new Map<string, number>();
  for (const p of (photosRes.data ?? []) as { inspection_section_id: string }[]) {
    photoCounts.set(p.inspection_section_id, (photoCounts.get(p.inspection_section_id) ?? 0) + 1);
  }

  return ((sectionsRes.data ?? []) as any[]).map((s) => ({
    ...s,
    photoCount: photoCounts.get(s.id) ?? 0,
  })) as ComparableSection[];
}

export const propertyEventDate = eventDate;
