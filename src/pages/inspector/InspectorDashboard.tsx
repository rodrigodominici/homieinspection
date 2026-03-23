import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { InspectionStatusBadge } from '@/components/StatusBadge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { calculateProgress } from '@/lib/inspection-utils';
import { ensureInspectionStatusConsistency } from '@/lib/inspection-status-guard';
import InspectorBottomNav from '@/components/InspectorBottomNav';
import type { Inspection, InspectionSection } from '@/lib/types';
import { MapPin, ArrowRight, CalendarClock, Navigation, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface InspectionWithProgress extends Inspection {
  totalSections: number;
  completedSections: number;
  scheduleDatetime: Date | null;
}

function getScheduleDatetime(insp: Inspection): Date | null {
  const snapshot = insp.property_snapshot_json as Record<string, unknown>;
  const fecha = snapshot?.fecha_recoleccion_llaves as string | undefined;
  const hora = snapshot?.hora_recoleccion_llaves as string | undefined;
  if (fecha) {
    const timeStr = hora || '00:00';
    const dt = new Date(`${fecha}T${timeStr}`);
    return isNaN(dt.getTime()) ? null : dt;
  }
  if (insp.scheduled_at) {
    const dt = new Date(insp.scheduled_at);
    return isNaN(dt.getTime()) ? null : dt;
  }
  return null;
}

export default function InspectorDashboard() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
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
            .select('id, status, is_visible, section_type')
            .eq('inspection_id', insp.id);
          const secs = (sections ?? []) as unknown as Pick<InspectionSection, 'status' | 'is_visible' | 'section_type'>[];
          const progress = calculateProgress(secs);

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
            scheduleDatetime: getScheduleDatetime(insp),
          };
        })
      );

      setInspections(withProgress);
      setLoading(false);
    };
    fetch();
  }, []);

  const now = new Date();
  const activeInspections = inspections.filter((i) =>
    ['assigned', 'in_progress', 'needs_changes'].includes(i.status)
  );

  // Sort by schedule date, upcoming first
  const upcoming = activeInspections
    .filter((i) => !i.scheduleDatetime || i.scheduleDatetime >= now)
    .sort((a, b) => {
      if (!a.scheduleDatetime) return 1;
      if (!b.scheduleDatetime) return -1;
      return a.scheduleDatetime.getTime() - b.scheduleDatetime.getTime();
    });

  const nextInsp = upcoming[0];

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-card/80 backdrop-blur-sm">
        <div className="flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary">
              <span className="text-sm font-bold text-primary-foreground">H</span>
            </div>
            <div>
              <h1 className="text-h4">Próximas</h1>
              <p className="text-tiny text-muted-foreground">{profile?.full_name}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="px-4 py-4 space-y-5">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-40 rounded-2xl" />
            ))}
          </div>
        ) : upcoming.length === 0 ? (
          <div className="py-16 text-center">
            <CalendarClock className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
            <p className="text-body-lg text-muted-foreground">No tienes inspecciones próximas</p>
            <p className="text-caption text-muted-foreground mt-1">Las inspecciones aparecerán aquí cuando sean programadas.</p>
          </div>
        ) : (
          <>
            {/* Hero: next inspection */}
            {nextInsp && (
              <NextInspectionHero inspection={nextInsp} />
            )}

            {/* Quick stats */}
            <div className="flex gap-3">
              <div className="flex-1 rounded-2xl bg-primary/5 p-3 text-center">
                <p className="text-h3 text-primary">{upcoming.length}</p>
                <p className="text-tiny text-muted-foreground">Pendientes</p>
              </div>
              <div className="flex-1 rounded-2xl bg-muted/50 p-3 text-center">
                <p className="text-h3">{upcoming.filter(i => i.scheduleDatetime && i.scheduleDatetime.toDateString() === now.toDateString()).length}</p>
                <p className="text-tiny text-muted-foreground">Hoy</p>
              </div>
            </div>

            {/* Upcoming list */}
            {upcoming.length > 1 && (
              <section>
                <h2 className="text-caption font-medium text-muted-foreground uppercase tracking-wider mb-3">Próximas inspecciones</h2>
                <div className="space-y-3">
                  {upcoming.slice(1).map((insp) => (
                    <InspectionCard key={insp.id} inspection={insp} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>

      <InspectorBottomNav />
    </div>
  );
}

function NextInspectionHero({ inspection: insp }: { inspection: InspectionWithProgress }) {
  const progress = insp.totalSections > 0 ? Math.round((insp.completedSections / insp.totalSections) * 100) : 0;
  const address = insp.address ?? 'Sin dirección';

  return (
    <Card className="border-0 ring-1 ring-primary/20 shadow-md rounded-2xl overflow-hidden">
      <div className="bg-primary/5 px-4 pt-3 pb-2">
        <div className="flex items-center gap-2 text-tiny text-primary font-semibold uppercase tracking-wider">
          <CalendarClock className="h-3.5 w-3.5" />
          Siguiente inspección
        </div>
      </div>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1 flex-1 min-w-0">
            <p className="text-h4 font-semibold truncate">{insp.property_name ?? insp.property_id}</p>
            <div className="flex items-center gap-1 text-caption text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{address}</span>
            </div>
          </div>
          <InspectionStatusBadge status={insp.status} />
        </div>

        {/* Schedule info */}
        {insp.scheduleDatetime && (
          <div className="flex items-center gap-2 text-caption text-muted-foreground bg-muted/40 rounded-xl px-3 py-2">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            <span>{insp.scheduleDatetime.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' })} · {insp.scheduleDatetime.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        )}

        {/* Progress */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-caption text-muted-foreground">
            <span>{insp.completedSections} de {insp.totalSections} secciones</span>
            <span className="font-medium">{progress}%</span>
          </div>
          <Progress value={progress} className={cn("h-2.5 rounded-full", progress === 100 && "[&>div]:bg-[hsl(var(--status-good))]")} />
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {insp.address && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl gap-1.5"
              onClick={(e) => {
                e.preventDefault();
                window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(insp.address!)}`, '_blank');
              }}
            >
              <Navigation className="h-3.5 w-3.5" /> Cómo llegar
            </Button>
          )}
          <Link to={`/inspector/inspection/${insp.id}`} className="flex-1">
            <Button className="w-full rounded-xl gap-1.5 h-10">
              {insp.status === 'assigned' ? 'Iniciar' : insp.status === 'needs_changes' ? 'Corregir' : 'Continuar'}
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function InspectionCard({ inspection: insp }: { inspection: InspectionWithProgress }) {
  const progress = insp.totalSections > 0 ? Math.round((insp.completedSections / insp.totalSections) * 100) : 0;

  return (
    <Link to={`/inspector/inspection/${insp.id}`}>
      <Card className="border-0 ring-1 ring-border shadow-sm hover:shadow-md transition-shadow active:scale-[0.99] rounded-2xl">
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-2">
            <div className="space-y-1 flex-1 min-w-0">
              <p className="font-semibold truncate">{insp.property_name ?? insp.property_id}</p>
              <div className="flex items-center gap-1 text-caption text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{insp.address ?? 'Sin dirección'}</span>
              </div>
            </div>
            <InspectionStatusBadge status={insp.status} />
          </div>

          {insp.scheduleDatetime && (
            <div className="flex items-center gap-1.5 text-tiny text-muted-foreground mb-2">
              <Clock className="h-3 w-3" />
              <span>{insp.scheduleDatetime.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' })} · {insp.scheduleDatetime.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-caption text-muted-foreground">
              <span>{insp.completedSections} de {insp.totalSections} secciones</span>
              <span className="font-medium">{progress}%</span>
            </div>
            <Progress value={progress} className={cn("h-2 rounded-full", progress === 100 && "[&>div]:bg-[hsl(var(--status-good))]")} />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
