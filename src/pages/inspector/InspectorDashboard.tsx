import { useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { calculateProgress, getEffectiveSnapshot } from '@/lib/inspection-utils';
import { useInspectorInspections } from '@/modules/inspection/api/useInspectorInspections';
import InspectorBottomNav from '@/components/InspectorBottomNav';
import type { Inspection, InspectionSection } from '@/lib/types';
import { MapPin, ArrowRight, Navigation, Clock, AlertTriangle, CheckCircle2, Loader2, MessageCircle, PhoneCall, ClipboardList, PlayCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getInspectorDisplayState,
  getScheduleDatetime,
  getContractEndDate,
  isCompletedToday,
  isToCoordinate,
} from '@/lib/inspector-operational';
import { getContractDateShortLabel } from '@/lib/inspection-type-labels';
import InspectorStatusBadge from '@/components/InspectorStatusBadge';
import InspectionTypeChip from '@/components/inspector/InspectionTypeChip';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface InspectionWithProgress extends Inspection {
  totalSections: number;
  completedSections: number;
  scheduleDatetime: Date | null;
}

const STALE_STATUSES = new Set(['pending', 'assigned', 'pending_assignment']);
const ACTIVE_SECTION_STATUSES = new Set(['in_progress', 'completed', 'reviewed']);

export default function InspectorDashboard() {
  const { profile } = useAuth();
  const { inspections: raw, sectionsByInspection, loading } = useInspectorInspections();
  const persistedRef = useRef<Set<string>>(new Set());

  // Compute enriched inspections + collect ones that need a stale-status fix.
  const inspections = useMemo<InspectionWithProgress[]>(() => {
    const toTransition: string[] = [];
    const result = raw.map((insp) => {
      const secs = sectionsByInspection[insp.id] ?? [];
      const progress = calculateProgress(secs);

      let nextStatus = insp.status;
      const visibleSecs = secs.filter((s) => s.is_visible);
      const hasActive = visibleSecs.some((s) => ACTIVE_SECTION_STATUSES.has(s.status));
      if (STALE_STATUSES.has(insp.status) && visibleSecs.length > 0 && hasActive) {
        nextStatus = 'in_progress' as Inspection['status'];
        toTransition.push(insp.id);
      }

      return {
        ...insp,
        status: nextStatus,
        totalSections: progress.total,
        completedSections: progress.completed,
        scheduleDatetime: getScheduleDatetime({ ...insp, status: nextStatus }),
      };
    });

    // Stash the pending transitions on a ref so the effect below can fire
    // them once per id without re-running on every memo recompute.
    (result as unknown as { __toTransition?: string[] }).__toTransition = toTransition;
    return result;
  }, [raw, sectionsByInspection]);

  useEffect(() => {
    const toTransition = ((inspections as unknown as { __toTransition?: string[] }).__toTransition ?? [])
      .filter((id) => !persistedRef.current.has(id));
    if (toTransition.length === 0) return;
    toTransition.forEach((id) => persistedRef.current.add(id));
    const nowIso = new Date().toISOString();
    supabase
      .from('inspections')
      .update({ status: 'in_progress', started_at: nowIso })
      .in('id', toTransition)
      .is('started_at', null)
      .then(() => undefined, () => undefined);
    supabase
      .from('inspections')
      .update({ status: 'in_progress' })
      .in('id', toTransition)
      .then(() => undefined, () => undefined);
  }, [inspections]);



  const now = new Date();
  const todayStr = now.toDateString();

  // "Total asignadas" excludes pending_assignment — that status is not yet
  // actionable for the inspector (no formal assignment).
  const assigned = inspections.filter((i) =>
    ['assigned', 'in_progress'].includes(i.status)
  );
  // Broader "active" set used internally (includes pending_assignment for to_coordinate detection).
  const active = inspections.filter((i) =>
    ['assigned', 'in_progress', 'pending_assignment'].includes(i.status)
  );

  const todayInspections = assigned.filter(
    (i) => i.scheduleDatetime && i.scheduleDatetime.toDateString() === todayStr
  );

  const inProgress = assigned.filter((i) =>
    getInspectorDisplayState(i, i.completedSections, i.totalSections, i).key === 'in_progress'
  );
  const toStart = assigned.filter((i) =>
    getInspectorDisplayState(i, i.completedSections, i.totalSections, i).key === 'assigned'
  );
  const completedToday = inspections.filter((i) => isCompletedToday(i));
  const toCoordinate = active.filter((i) => isToCoordinate(i));

  const readyToSend = active.filter((i) =>
    getInspectorDisplayState(i, i.completedSections, i.totalSections, i).key === 'ready_to_submit'
  );

  const upcoming = active
    .filter((i) => i.scheduleDatetime && i.scheduleDatetime >= new Date(now.getTime() - 3600000))
    .sort((a, b) => {
      if (!a.scheduleDatetime) return 1;
      if (!b.scheduleDatetime) return -1;
      return a.scheduleDatetime.getTime() - b.scheduleDatetime.getTime();
    });

  // Hero priority: in_progress → ready_to_submit → scheduled today/upcoming → to_coordinate → empty
  const inProgressHero = inProgress[0] ?? null;
  const readyHero = readyToSend[0] ?? null;
  const scheduledHero = upcoming[0] ?? null;
  const toCoordinateHero = toCoordinate.sort((a, b) => {
    const aEnd = getContractEndDate(a)?.getTime() ?? Infinity;
    const bEnd = getContractEndDate(b)?.getTime() ?? Infinity;
    return aEnd - bEnd;
  })[0] ?? null;
  const heroInspection = inProgressHero ?? readyHero ?? scheduledHero ?? toCoordinateHero ?? null;
  const heroContext = inProgressHero
    ? 'En progreso ahora'
    : readyHero
      ? 'Lista para envío final'
      : scheduledHero
        ? 'Próxima inspección'
        : toCoordinateHero
          ? 'Pendiente de coordinar'
          : '';

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

      <main className="px-4 space-y-7">
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
            {heroInspection ? (
              <HeroCard inspection={heroInspection} contextLabel={heroContext} />
            ) : (
              <Card className="border-0 shadow-sm rounded-3xl bg-card">
                <CardContent className="p-6 text-center">
                  <CheckCircle2 className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-base font-medium text-muted-foreground">Sin inspecciones pendientes</p>
                  <p className="text-xs text-muted-foreground mt-1">¡Buen trabajo!</p>
                </CardContent>
              </Card>
            )}

            {/* Stats 2x2 — operational summary */}
            <div className="grid grid-cols-2 gap-3">
              <StatTile label="Total asignadas" value={assigned.length} icon={ClipboardList} to="/inspector/all?filter=active" accent tooltip="Todas tus inspecciones activas (asignadas + en progreso)." />
              <StatTile label="Por coordinar" value={toCoordinate.length} icon={PhoneCall} to="/inspector/all?filter=active&state=to_coordinate" tooltip="Falta coordinar fecha o acceso con el propietario/inquilino." />
              <StatTile label="Por iniciar" value={toStart.length} icon={PlayCircle} to="/inspector/all?filter=active&state=assigned" tooltip="Coordinadas y listas para arrancar el día de visita." />
              <StatTile label="En espera de Hallazgos" value={inProgress.length} icon={Loader2} to="/inspector/all?filter=active&state=in_progress" tooltip="Ya iniciaste la captura en sitio. Continúa donde quedaste." />
            </div>


            {/* Por coordinar */}
            {toCoordinate.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Por coordinar</h2>
                <div className="space-y-3">
                  {toCoordinate.map((insp) => {
                    const contractEnd = getContractEndDate(insp);
                    const snapshot = getEffectiveSnapshot(insp);
                    const tenantWhatsapp = (snapshot?.tenant_whatsapp as string) ?? null;
                    return (
                      <Card key={insp.id} className="border-0 ring-1 ring-status-bad/15 shadow-sm rounded-2xl">
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <p className="font-medium text-sm truncate">{insp.property_name ?? insp.property_id}</p>
                                <InspectionTypeChip type={insp.inspection_type} />
                              </div>
                              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                                <MapPin className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">{insp.address ?? 'Sin dirección'}</span>
                              </div>
                            </div>
                            <InspectorStatusBadge state={{ key: 'to_coordinate', label: 'Por coordinar', tone: 'warning' }} />
                          </div>
                          {contractEnd && (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-xl px-3 py-2">
                              <Clock className="h-3.5 w-3.5 shrink-0" />
                              <span>{getContractDateShortLabel(insp.inspection_type)}: {contractEnd.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                            </div>
                          )}
                          <div className="flex gap-2">
                            {tenantWhatsapp && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-1 rounded-xl gap-1.5 text-[hsl(var(--status-good))] border-[hsl(var(--status-good))]/30"
                                onClick={(e) => {
                                  e.preventDefault();
                                  const cleaned = tenantWhatsapp.replace(/[^+\d]/g, '');
                                  const msg = encodeURIComponent(`Hola, soy de Homie. Te contacto para coordinar la recolección de llaves de la propiedad${insp.property_name ? ` ${insp.property_name}` : ''}.`);
                                  window.open(`https://wa.me/${cleaned}?text=${msg}`, '_blank');
                                }}
                              >
                                <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                              </Button>
                            )}
                            <Link to={`/inspector/inspection/${insp.id}`} className="flex-1">
                              <Button size="sm" className="w-full rounded-xl gap-1.5 h-9">
                                Cargar fecha <ArrowRight className="h-3.5 w-3.5" />
                              </Button>
                            </Link>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Today's schedule */}
            {todayInspections.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Agenda de hoy</h2>
                <div className="space-y-3">
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

function StatTile({
  label,
  value,
  icon: Icon,
  to,
  accent,
  tooltip,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  to: string;
  accent?: boolean;
  tooltip?: string;
}) {
  const tile = (
    <Link to={to} className="block">
      <Card className={cn("border-0 shadow-sm rounded-2xl active:scale-[0.99] transition-transform", accent ? "bg-primary/5" : "bg-card")}>
        <CardContent className="p-4 min-h-[88px] flex flex-col items-center justify-center text-center gap-1">
          <Icon className={cn("h-4 w-4", accent ? "text-primary" : "text-muted-foreground")} />
          <p className={cn("text-2xl font-bold", accent ? "text-primary" : "text-foreground")}>{value}</p>
          <p className="text-[10px] text-muted-foreground font-medium">{label}</p>
        </CardContent>
      </Card>
    </Link>
  );

  if (!tooltip) return tile;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>{tile}</TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[240px] text-xs leading-snug">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}


function HeroCard({ inspection: insp, contextLabel }: { inspection: InspectionWithProgress; contextLabel: string }) {
  const progress = insp.totalSections > 0 ? Math.round((insp.completedSections / insp.totalSections) * 100) : 0;
  const address = insp.address ?? 'Sin dirección';
  const displayState = getInspectorDisplayState(insp, insp.completedSections, insp.totalSections, insp);
  const cta = displayState.key === 'ready_to_submit'
    ? 'Revisar y enviar'
    : displayState.key === 'assigned' || displayState.key === 'to_coordinate'
      ? 'Iniciar'
      : 'Continuar';

  return (
    <Card className="border-0 shadow-md rounded-3xl overflow-hidden bg-card">
      <div className="bg-primary/5 px-5 pt-3.5 pb-2">
        <p className="text-[10px] text-primary font-semibold uppercase tracking-widest">{contextLabel}</p>
      </div>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2 min-w-0">
              <p className="text-lg font-bold truncate">{insp.property_name ?? insp.property_id}</p>
              <InspectionTypeChip type={insp.inspection_type} />
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{address}</span>
            </div>
          </div>
          <InspectorStatusBadge state={displayState} />
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
  const displayState = getInspectorDisplayState(insp, insp.completedSections, insp.totalSections, insp);

  return (
    <Link to={`/inspector/inspection/${insp.id}`}>
      <Card className="border-0 ring-1 ring-border shadow-sm rounded-2xl active:scale-[0.99] transition-transform">
        <CardContent className="p-3.5 flex items-center gap-3">
          {insp.scheduleDatetime && (
            <div className="text-center shrink-0 w-12">
              <p className="text-sm font-bold text-foreground">{insp.scheduleDatetime.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</p>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <p className="text-sm font-medium truncate">{insp.property_name ?? insp.property_id}</p>
              <InspectionTypeChip type={insp.inspection_type} size="xs" />
            </div>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{insp.address ?? 'Sin dirección'}</span>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs font-semibold text-muted-foreground">{progress}%</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{displayState.label}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
