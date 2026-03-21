import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { InspectionStatusBadge } from '@/components/StatusBadge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { calculateProgress } from '@/lib/inspection-utils';
import { ensureInspectionStatusConsistency } from '@/lib/inspection-status-guard';
import type { Inspection, InspectionSection } from '@/lib/types';
import { LogOut, MapPin, ArrowRight, ClipboardList } from 'lucide-react';

interface InspectionWithProgress extends Inspection {
  totalSections: number;
  completedSections: number;
}

export default function InspectorDashboard() {
  const { profile, signOut } = useAuth();
  const [inspections, setInspections] = useState<InspectionWithProgress[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data: inspData } = await supabase
        .from('inspections')
        .select('*')
        .order('updated_at', { ascending: false });

      if (!inspData) { setLoading(false); return; }

      const withProgress = await Promise.all(
        (inspData as unknown as Inspection[]).map(async (insp) => {
          const { data: sections } = await supabase
            .from('inspection_sections')
            .select('id, status, is_visible')
            .eq('inspection_id', insp.id);
          const secs = (sections ?? []) as unknown as Pick<InspectionSection, 'status' | 'is_visible'>[];
          const progress = calculateProgress(secs);

          // Guard: fix stale status on hydration
          if (progress.completed > 0 && ['pending', 'assigned', 'pending_assignment'].includes(insp.status)) {
            const newStatus = await ensureInspectionStatusConsistency(insp.id);
            if (newStatus && newStatus !== insp.status) {
              insp = { ...insp, status: newStatus as Inspection['status'] };
            }
          }

          return {
            ...insp,
            totalSections: progress.total,
            completedSections: progress.completed,
          };
        })
      );

      setInspections(withProgress);
      setLoading(false);
    };
    fetch();
  }, []);

  const activeInspections = inspections.filter((i) =>
    ['assigned', 'in_progress', 'needs_changes'].includes(i.status)
  );
  const otherInspections = inspections.filter(
    (i) => !['assigned', 'in_progress', 'needs_changes'].includes(i.status)
  );

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-10 border-b bg-card/80 backdrop-blur-sm">
        <div className="flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary">
              <span className="text-sm font-bold text-primary-foreground">H</span>
            </div>
            <div>
              <h1 className="text-h4">Mis Inspecciones</h1>
              <p className="text-tiny text-muted-foreground">{profile?.full_name}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={signOut}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="px-4 py-4 space-y-6">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-36 rounded-2xl" />
            ))}
          </div>
        ) : activeInspections.length === 0 && otherInspections.length === 0 ? (
          <div className="py-16 text-center">
            <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
            <p className="text-body-lg text-muted-foreground">No tienes inspecciones asignadas</p>
            <p className="text-caption text-muted-foreground mt-1">Las inspecciones aparecerán aquí cuando sean asignadas.</p>
          </div>
        ) : (
          <>
            {activeInspections.length > 0 && (
              <section>
                <h2 className="text-caption font-medium text-muted-foreground uppercase tracking-wider mb-3">Activas</h2>
                <div className="space-y-3">
                  {activeInspections.map((insp) => (
                    <InspectionCard key={insp.id} inspection={insp} />
                  ))}
                </div>
              </section>
            )}
            {otherInspections.length > 0 && (
              <section>
                <h2 className="text-caption font-medium text-muted-foreground uppercase tracking-wider mb-3">Otras</h2>
                <div className="space-y-3">
                  {otherInspections.map((insp) => (
                    <InspectionCard key={insp.id} inspection={insp} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function InspectionCard({ inspection: insp }: { inspection: InspectionWithProgress }) {
  const progress = insp.totalSections > 0
    ? Math.round((insp.completedSections / insp.totalSections) * 100)
    : 0;

  const ctaLabel = insp.status === 'assigned' ? 'Iniciar' :
    insp.status === 'needs_changes' ? 'Corregir' : 'Continuar';

  return (
    <Link to={`/inspector/inspection/${insp.id}`}>
      <Card className="border-0 ring-1 ring-border shadow-sm hover:shadow-md transition-shadow active:scale-[0.99] rounded-2xl">
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="space-y-1 flex-1 min-w-0">
              <p className="font-semibold truncate">{insp.property_name ?? insp.property_id}</p>
              <div className="flex items-center gap-1 text-caption text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{insp.address ?? 'Sin dirección'}</span>
              </div>
            </div>
            <InspectionStatusBadge status={insp.status} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-caption text-muted-foreground">
              <span>{insp.completedSections} de {insp.totalSections} secciones</span>
              <span className="font-medium">{progress}%</span>
            </div>
            <Progress value={progress} className="h-2.5 rounded-full" />
          </div>

          {['assigned', 'in_progress', 'needs_changes'].includes(insp.status) && (
            <div className="mt-4 flex justify-end">
              <Button size="sm" className="gap-1 rounded-xl h-10 px-5">
                {ctaLabel} <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
