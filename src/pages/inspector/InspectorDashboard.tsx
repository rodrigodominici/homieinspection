import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { InspectionStatusBadge } from '@/components/StatusBadge';
import { Progress } from '@/components/ui/progress';
import type { Inspection, InspectionSection } from '@/lib/types';
import { LogOut, MapPin, ArrowRight } from 'lucide-react';

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

      // Get section counts
      const withProgress = await Promise.all(
        (inspData as unknown as Inspection[]).map(async (insp) => {
          const { data: sections } = await supabase
            .from('inspection_sections')
            .select('id, status')
            .eq('inspection_id', insp.id)
            .eq('is_visible', true);
          const secs = (sections ?? []) as unknown as InspectionSection[];
          return {
            ...insp,
            totalSections: secs.length,
            completedSections: secs.filter((s) => s.status === 'completed' || s.status === 'reviewed').length,
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
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <span className="text-sm font-bold text-primary-foreground">H</span>
            </div>
            <div>
              <h1 className="text-lg font-semibold">Mis Inspecciones</h1>
              <p className="text-xs text-muted-foreground">{profile?.full_name}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={signOut}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="px-4 py-4 space-y-6">
        {loading ? (
          <div className="py-12 text-center text-muted-foreground">Cargando...</div>
        ) : activeInspections.length === 0 && otherInspections.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            No tienes inspecciones asignadas
          </div>
        ) : (
          <>
            {activeInspections.length > 0 && (
              <section>
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  Activas
                </h2>
                <div className="space-y-3">
                  {activeInspections.map((insp) => (
                    <InspectionCard key={insp.id} inspection={insp} />
                  ))}
                </div>
              </section>
            )}
            {otherInspections.length > 0 && (
              <section>
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  Otras
                </h2>
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
      <Card className="border-0 ring-1 ring-border/50 shadow-sm hover:shadow-md transition-shadow active:scale-[0.99]">
        <CardContent className="py-4">
          <div className="flex items-start justify-between mb-3">
            <div className="space-y-1 flex-1 min-w-0">
              <p className="font-medium truncate">{insp.property_name ?? insp.property_id}</p>
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{insp.address ?? 'Sin dirección'}</span>
              </div>
            </div>
            <InspectionStatusBadge status={insp.status} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{insp.completedSections} de {insp.totalSections} secciones</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          {['assigned', 'in_progress', 'needs_changes'].includes(insp.status) && (
            <div className="mt-3 flex justify-end">
              <Button size="sm" className="gap-1">
                {ctaLabel} <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
