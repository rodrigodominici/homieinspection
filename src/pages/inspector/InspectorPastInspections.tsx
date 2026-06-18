import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { InspectionStatusBadge } from '@/components/StatusBadge';
import { Skeleton } from '@/components/ui/skeleton';
import InspectorBottomNav from '@/components/InspectorBottomNav';
import { getEffectiveSnapshot } from '@/lib/inspection-utils';
import { INSPECTION_LIST_COLUMNS } from '@/lib/inspection-columns';
import type { Inspection } from '@/lib/types';
import { MapPin, Clock, History } from 'lucide-react';

export default function InspectorPastInspections() {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('inspections')
      .select('*')
      .in('status', ['submitted', 'in_review', 'approved', 'published', 'sent'])
      .order('completed_at', { ascending: false })
      .then(({ data }) => {
        setInspections((data ?? []) as unknown as Inspection[]);
        setLoading(false);
      });
  }, []);

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-10 border-b bg-card/80 backdrop-blur-sm">
        <div className="flex h-16 items-center px-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary">
              <span className="text-sm font-bold text-primary-foreground">H</span>
            </div>
            <h1 className="text-h4">Pasadas</h1>
          </div>
        </div>
      </header>

      <main className="px-4 py-4 space-y-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)
        ) : inspections.length === 0 ? (
          <div className="py-16 text-center">
            <History className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
            <p className="text-body-lg text-muted-foreground">No tienes inspecciones pasadas</p>
          </div>
        ) : (
          inspections.map((insp) => {
            const snapshot = getEffectiveSnapshot(insp);
            const fecha = (snapshot?.fecha_recoleccion_llaves as string) ?? null;
            return (
              <Link key={insp.id} to={`/inspector/inspection/${insp.id}`}>
                <Card className="border-0 ring-1 ring-border shadow-sm rounded-2xl">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-1">
                      <p className="font-semibold truncate flex-1">{insp.property_name ?? insp.property_id}</p>
                      <InspectionStatusBadge status={insp.status} />
                    </div>
                    <div className="flex items-center gap-1 text-caption text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{insp.address ?? 'Sin dirección'}</span>
                    </div>
                    {(fecha || insp.completed_at) && (
                      <div className="flex items-center gap-1 text-tiny text-muted-foreground mt-1">
                        <Clock className="h-3 w-3" />
                        <span>{fecha ?? (insp.completed_at ? new Date(insp.completed_at).toLocaleDateString('es-CL') : '')}</span>
                      </div>
                    )}
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
