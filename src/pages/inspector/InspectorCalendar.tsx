import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { InspectionStatusBadge } from '@/components/StatusBadge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import InspectorBottomNav from '@/components/InspectorBottomNav';
import { calculateProgress, getEffectiveSnapshot } from '@/lib/inspection-utils';
import type { Inspection, InspectionSection } from '@/lib/types';
import { MapPin, Clock, ArrowRight, CalendarDays, Navigation } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AgendaInspection extends Inspection {
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

const DAY_ABBR = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function generateDays(count: number): Date[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    return d;
  });
}

export default function InspectorCalendar() {
  const { profile } = useAuth();
  const [inspections, setInspections] = useState<AgendaInspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d;
  });
  const scrollRef = useRef<HTMLDivElement>(null);

  const days = generateDays(14);
  const todayStr = new Date().toDateString();

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('inspections')
        .select('*')
        .in('status', ['assigned', 'in_progress', 'needs_changes', 'pending_assignment'])
        .order('scheduled_at', { ascending: true });

      if (!data) { setLoading(false); return; }

      const withProgress = await Promise.all(
        (data as unknown as Inspection[]).map(async (insp) => {
          const { data: sections } = await supabase
            .from('inspection_sections')
            .select('id, status, is_visible, section_type')
            .eq('inspection_id', insp.id);
          const progress = calculateProgress((sections ?? []) as unknown as Pick<InspectionSection, 'status' | 'is_visible' | 'section_type'>[]);
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

  const selectedStr = selectedDate.toDateString();
  const dayInspections = inspections
    .filter((i) => i.scheduleDatetime?.toDateString() === selectedStr)
    .sort((a, b) => (a.scheduleDatetime?.getTime() ?? 0) - (b.scheduleDatetime?.getTime() ?? 0));

  const unscheduled = inspections.filter((i) => !i.scheduleDatetime);

  return (
    <div className="min-h-screen bg-muted/30 pb-24">
      {/* Header */}
      <header className="px-5 pt-6 pb-3">
        <h1 className="text-xl font-bold text-foreground">Agenda</h1>
        <p className="text-xs text-muted-foreground">{profile?.full_name}</p>
      </header>

      {/* Horizontal day selector */}
      <div ref={scrollRef} className="flex gap-2 px-4 pb-4 overflow-x-auto scrollbar-hide">
        {days.map((day) => {
          const isToday = day.toDateString() === todayStr;
          const isSelected = day.toDateString() === selectedStr;
          const hasInspections = inspections.some((i) => i.scheduleDatetime?.toDateString() === day.toDateString());
          return (
            <button
              key={day.toISOString()}
              onClick={() => setSelectedDate(day)}
              className={cn(
                'flex flex-col items-center justify-center min-w-[52px] h-[68px] rounded-2xl transition-all shrink-0',
                isSelected
                  ? 'bg-primary text-primary-foreground shadow-md'
                  : 'bg-card text-foreground hover:bg-muted'
              )}
            >
              <span className={cn('text-[10px] font-medium', isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                {DAY_ABBR[day.getDay()]}
              </span>
              <span className={cn('text-lg font-bold', isSelected ? 'text-primary-foreground' : 'text-foreground')}>
                {day.getDate()}
              </span>
              {hasInspections && !isSelected && (
                <div className="h-1 w-1 rounded-full bg-primary mt-0.5" />
              )}
              {isToday && !isSelected && (
                <div className="h-1 w-1 rounded-full bg-status-good mt-0.5" />
              )}
            </button>
          );
        })}
      </div>

      {/* Day content */}
      <main className="px-4 space-y-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)
        ) : dayInspections.length === 0 ? (
          <Card className="border-0 shadow-sm rounded-3xl bg-card">
            <CardContent className="p-8 text-center">
              <CalendarDays className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">Sin inspecciones este día</p>
            </CardContent>
          </Card>
        ) : (
          dayInspections.map((insp) => <AgendaCard key={insp.id} inspection={insp} />)
        )}

        {/* Unscheduled */}
        {!loading && unscheduled.length > 0 && (
          <section className="pt-2">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Sin programar</h2>
            <div className="space-y-2">
              {unscheduled.map((insp) => <AgendaCard key={insp.id} inspection={insp} />)}
            </div>
          </section>
        )}
      </main>

      <InspectorBottomNav />
    </div>
  );
}

function AgendaCard({ inspection: insp }: { inspection: AgendaInspection }) {
  const progress = insp.totalSections > 0 ? Math.round((insp.completedSections / insp.totalSections) * 100) : 0;
  const address = insp.address ?? 'Sin dirección';
  const snapshot = getEffectiveSnapshot(insp);
  const comuna = insp.market === 'CL' ? (snapshot?.comuna as string) ?? null : null;
  const cta = insp.status === 'assigned' ? 'Iniciar' : insp.status === 'needs_changes' ? 'Corregir' : 'Continuar';

  return (
    <Card className="border-0 ring-1 ring-border shadow-sm rounded-2xl active:scale-[0.99] transition-all">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{insp.property_name ?? insp.property_id}</p>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{address}{comuna ? ` · ${comuna}` : ''}</span>
            </div>
          </div>
          <InspectionStatusBadge status={insp.status} />
        </div>

        {insp.scheduleDatetime && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-xl px-3 py-2">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            <span>{insp.scheduleDatetime.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        )}

        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{insp.completedSections} de {insp.totalSections}</span>
            <span className="font-medium">{progress}%</span>
          </div>
          <Progress value={progress} className="h-2 rounded-full" />
        </div>

        <div className="flex gap-2">
          {insp.address && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl gap-1.5"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(insp.address!)}`, '_blank');
              }}
            >
              <Navigation className="h-3.5 w-3.5" /> Ir
            </Button>
          )}
          <Link to={`/inspector/inspection/${insp.id}`} className="flex-1">
            <Button className="w-full rounded-xl gap-1.5 h-9" size="sm">
              {cta} <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
