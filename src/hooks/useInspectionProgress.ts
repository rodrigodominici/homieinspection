import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface InspectionProgress {
  totalSections: number;
  doneSections: number;
  photos: number;
}

/**
 * Avance agregado (secciones completadas y fotos) para un set acotado de
 * inspecciones abiertas. Sólo trae columnas mínimas y agrupa en el cliente.
 */
export function useInspectionProgress(inspectionIds: string[]) {
  const ids = [...new Set(inspectionIds)].sort();
  return useQuery({
    queryKey: ['inspection-progress', ids],
    enabled: ids.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, InspectionProgress>> => {
      const [sectionsRes, photosRes] = await Promise.all([
        supabase
          .from('inspection_sections')
          .select('inspection_id, status, is_visible')
          .in('inspection_id', ids),
        supabase
          .from('inspection_photos')
          .select('inspection_id')
          .in('inspection_id', ids),
      ]);
      if (sectionsRes.error) throw sectionsRes.error;
      if (photosRes.error) throw photosRes.error;

      const map: Record<string, InspectionProgress> = {};
      const get = (id: string) =>
        (map[id] ??= { totalSections: 0, doneSections: 0, photos: 0 });

      for (const s of sectionsRes.data ?? []) {
        if (!s.is_visible) continue;
        const p = get(s.inspection_id);
        p.totalSections++;
        if (s.status === 'completed' || s.status === 'reviewed') p.doneSections++;
      }
      for (const ph of photosRes.data ?? []) get(ph.inspection_id).photos++;

      return map;
    },
  });
}
