import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { InspectionStatusBadge } from '@/components/StatusBadge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import InspectorBottomNav from '@/components/InspectorBottomNav';
import { calculateProgress } from '@/lib/inspection-utils';
import type { Inspection, InspectionSection } from '@/lib/types';
import { MapPin, ClipboardList } from 'lucide-react';

interface InspectionWithProgress extends Inspection {
  totalSections: number;
  completedSections: number;
}

export default function InspectorAllInspections() {
  const [inspections, setInspections] = useState<InspectionWithProgress[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase.from('inspections').select('*').order('updated_at', { ascending: false });
      if (!data) { setLoading(false); return; }
      const withProgress = await Promise.all(
        (data as unknown as Inspection[]).map(async (insp) => {
          const { data: sections } = await supabase
            .from('inspection_sections').select('id, status, is_visible, section_type').eq('inspection_id', insp.id);
          const progress = calculateProgress((sections ?? []) as unknown as Pick<InspectionSection, 'status' | 'is_visible' | 'section_type'>[]);
          return { ...insp, totalSections: progress.total, completedSections: progress.completed };
        })
      );
      setInspections(withProgress);
      setLoading(false);
    };
    fetch();
  }, []);

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-10 border-b bg-card/80 backdrop-blur-sm">
        <div className="flex h-16 items-center px-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary">
              <span className="text-sm font-bold text-primary-foreground">H</span>
            </div>
            <h1 className="text-h4">Todas las Inspecciones</h1>
          </div>
        </div>
      </header>

      <main className="px-4 py-4 space-y-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)
        ) : inspections.length === 0 ? (
          <div className="py-16 text-center">
            <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
            <p className="text-body-lg text-muted-foreground">No tienes inspecciones</p>
          </div>
        ) : (
          inspections.map((insp) => {
            const progress = insp.totalSections > 0 ? Math.round((insp.completedSections / insp.totalSections) * 100) : 0;
            return (
              <Link key={insp.id} to={`/inspector/inspection/${insp.id}`}>
                <Card className="border-0 ring-1 ring-border shadow-sm rounded-2xl">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{insp.property_name ?? insp.property_id}</p>
                        <div className="flex items-center gap-1 text-caption text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{insp.address ?? 'Sin dirección'}</span>
                        </div>
                      </div>
                      <InspectionStatusBadge status={insp.status} />
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-caption text-muted-foreground">
                        <span>{insp.completedSections} de {insp.totalSections}</span>
                        <span>{progress}%</span>
                      </div>
                      <Progress value={progress} className="h-2 rounded-full" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })
        )}
      </main>
      <InspectorBottomNav />
    </div>
  );
}
