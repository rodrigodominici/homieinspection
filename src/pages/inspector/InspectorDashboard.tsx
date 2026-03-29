import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { InspectionStatusBadge } from '@/components/StatusBadge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { calculateProgress, getEffectiveSnapshot } from '@/lib/inspection-utils';
import { ensureInspectionStatusConsistency } from '@/lib/inspection-status-guard';
import InspectorBottomNav from '@/components/InspectorBottomNav';
import type { Inspection, InspectionSection } from '@/lib/types';
import { MapPin, ArrowRight, Navigation, Clock, CalendarDays, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface InspectionWithProgress extends Inspection {
  totalSections: number;
  completedSections: number;
  scheduleDatetime: Date | null;
}

function getScheduleDatetime(insp: Inspection): Date | null {
  const snapshot = getEffectiveSnapshot(insp);
  const fecha = snapshot?.fecha_recoleccion_llaves as string | undefined;
  const hora = snapshot?.hora_recoleccion_llaves as string | undefined;
  if (fecha) {
    const dt = new Date(`${fecha}T${hora || '00:00'}`);
    return isNaN(dt.getTime()) ? null : dt;
  }
  if (insp.scheduled_at) {
    const dt = new Date(insp.scheduled_at);
    return isNaN(dt.getTime()) ? null : dt;
  }
  return null;
}

export default function InspectorDashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [inspections, setInspections] = useState<InspectionWithProgress[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
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
    load();
  }, []);

  const now = new Date();
  const todayStr = now.toDateString();

  const active = inspections.filter((i) =>
    ['assigned', 'in_progress', 'needs_changes'].includes(i.status)
  );

  const todayInspections = active.filter(
    (i) => i.scheduleDatetime && i.scheduleDatetime.toDateString() === todayStr
  );

  const inProgress = active.filter((i) => i.status === 'in_progress');
  const completedToday = inspections.filter(
    (i) => ['submitted', 'in_review', 'approved', 'published'].includes(i.status) &&
    i.completed_at && new Date(i.completed_at).toDateString() === todayStr
  );
  const needsAttention = active.filter((i) => i.status === 'needs_changes');

  // Next inspection: first today by time, then first upcoming
  const upcoming = active
    .filter((i) => !i.scheduleDatetime || i.scheduleDatetime >= new Date(now.getTime() - 3600000))
    .sort((a, b) => {
      if (!a.scheduleDatetime) return 1;
      if (!b.scheduleDatetime) return -1;
      return a.scheduleDatetime.getTime() - b.scheduleDatetime.getTime();
    });
  const nextInsp = upcoming[0];

  const dateLabel = now.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
  const greeting = now.getHours() < 12 ? 'Buenos días' : now.getHours() < 19 ? 'Buenas tardes' : 'Buenas noches';

  return (
    <div className="min-h-screen bg-muted/30 pb-24">
      {/* Header */}
      <header className="px-5 pt-6 pb-4">
        <p className="text-muted-foreground text-sm">{greeting},</p>
        <h1 className="text-xl font-bold text-foreground">{profile?.full_name ?? 'Inspector'}</h1>
        <p className="text-xs text-muted-foreground mt-0.5 capitalize">{dateLabel}</p>
      </header>

      <main className="px-4 space-y-5">
        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-44 rounded-3xl" />
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-20 rounded-2xl" />
              <Skeleton className="h-20 rounded-2xl" />
              <Skeleton className="h-20 rounded-2xl" />
              <Skeleton className="h-20 rounded-2xl" />
            </div>
          </div>
        ) : (
          <>
            {/* Hero: Next inspection */}
            {nextInsp ? (
              <HeroCard inspection={nextInsp} />
            ) : (
              <Card className="border-0 shadow-sm rounded-3xl bg-card">
                <CardContent className="p-6 text-center">
                  <CheckCircle2 className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-base font-medium text-muted-foreground">Sin inspecciones pendientes</p>
                  <p className="text-xs text-muted-foreground mt-1">¡Buen trabajo!</p>
                </CardContent>
              </Card>
            )}

            {/* Stats 2x2 */}
            <div className="grid grid-cols-2 gap-3">
              <StatTile label="Hoy" value={todayInspections.length} icon={CalendarDays} accent />
              <StatTile label="En progreso" value={inProgress.length} icon={Loader2} />
              <StatTile label="Completadas hoy" value={completedToday.length} icon={CheckCircle2} />
              <StatTile label="Pendientes" value={active.length} icon={Clock} />
            </div>

            {/* Needs attention */}
            {needsAttention.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Requiere atención</h2>
                <div className="space-y-2">
                  {needsAttention.map((insp) => (
                    <Link key={insp.id} to={`/inspector/inspection/${insp.id}`}>
                      <Card className="border-0 ring-1 ring-status-bad/20 bg-status-bad-bg/30 shadow-sm rounded-2xl active:scale-[0.99] transition-transform">
                        <CardContent className="p-4 flex items-center gap-3">
                          <AlertTriangle className="h-5 w-5 text-status-bad shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{insp.property_name ?? insp.property_id}</p>
                            <p className="text-xs text-muted-foreground">Cambios requeridos</p>
                          </div>
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Today's schedule */}
            {todayInspections.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Agenda de hoy</h2>
                <div className="space-y-2">
                  {todayInspections
                    .sort((a, b) => (a.scheduleDatetime?.getTime() ?? 0) - (b.scheduleDatetime?.getTime() ?? 0))
                    .map((insp) => (
                      <MiniCard key={insp.id} inspection={insp} />
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

function StatTile({ label, value, icon: Icon, accent }: { label: string; value: number; icon: React.ElementType; accent?: boolean }) {
  return (
    <Card className={cn("border-0 shadow-sm rounded-2xl", accent ? "bg-primary/5" : "bg-card")}>
      <CardContent className="p-4 flex flex-col items-center justify-center text-center gap-1">
        <Icon className={cn("h-4 w-4", accent ? "text-primary" : "text-muted-foreground")} />
        <p className={cn("text-2xl font-bold", accent ? "text-primary" : "text-foreground")}>{value}</p>
        <p className="text-[10px] text-muted-foreground font-medium">{label}</p>
      </CardContent>
    </Card>
  );
}

function HeroCard({ inspection: insp }: { inspection: InspectionWithProgress }) {
  const progress = insp.totalSections > 0 ? Math.round((insp.completedSections / insp.totalSections) * 100) : 0;
  const address = insp.address ?? 'Sin dirección';
  const cta = insp.status === 'assigned' ? 'Iniciar' : insp.status === 'needs_changes' ? 'Corregir' : 'Continuar';

  return (
    <Card className="border-0 shadow-md rounded-3xl overflow-hidden bg-card">
      <div className="bg-primary/5 px-5 pt-3.5 pb-2">
        <p className="text-[10px] text-primary font-semibold uppercase tracking-widest">Siguiente inspección</p>
      </div>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0 space-y-1">
            <p className="text-lg font-bold truncate">{insp.property_name ?? insp.property_id}</p>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{address}</span>
            </div>
          </div>
          <InspectionStatusBadge status={insp.status} />
        </div>

        {insp.scheduleDatetime && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-2xl px-3.5 py-2.5">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            <span>
              {insp.scheduleDatetime.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' })} · {insp.scheduleDatetime.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        )}

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{insp.completedSections} de {insp.totalSections} secciones</span>
            <span className="font-semibold">{progress}%</span>
          </div>
          <Progress value={progress} className={cn("h-2.5 rounded-full", progress === 100 && "[&>div]:bg-[hsl(var(--status-good))]")} />
        </div>

        <div className="flex gap-2.5">
          {insp.address && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-2xl gap-1.5 h-11 px-4"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(insp.address!)}`, '_blank');
              }}
            >
              <Navigation className="h-4 w-4" /> Ir
            </Button>
          )}
          <Link to={`/inspector/inspection/${insp.id}`} className="flex-1">
            <Button className="w-full rounded-2xl gap-1.5 h-11 text-sm font-semibold">
              {cta} <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function MiniCard({ inspection: insp }: { inspection: InspectionWithProgress }) {
  const progress = insp.totalSections > 0 ? Math.round((insp.completedSections / insp.totalSections) * 100) : 0;

  return (
    <Link to={`/inspector/inspection/${insp.id}`}>
      <Card className="border-0 ring-1 ring-border shadow-sm rounded-2xl active:scale-[0.99] transition-transform">
        <CardContent className="p-3.5 flex items-center gap-3">
          {/* Time */}
          {insp.scheduleDatetime && (
            <div className="text-center shrink-0 w-12">
              <p className="text-sm font-bold text-foreground">{insp.scheduleDatetime.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</p>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{insp.property_name ?? insp.property_id}</p>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{insp.address ?? 'Sin dirección'}</span>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs font-semibold text-muted-foreground">{progress}%</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
