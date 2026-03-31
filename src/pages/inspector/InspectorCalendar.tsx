import { useEffect, useState, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import InspectorStatusBadge from '@/components/InspectorStatusBadge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import InspectorBottomNav from '@/components/InspectorBottomNav';
import { calculateProgress, getEffectiveSnapshot } from '@/lib/inspection-utils';
import type { Inspection, InspectionSection } from '@/lib/types';
import { MapPin, Clock, ArrowRight, CalendarDays, Navigation } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getInspectorDisplayState, getScheduleDatetime } from '@/lib/inspector-operational';

interface AgendaInspection extends Inspection {
  totalSections: number;
  completedSections: number;
  scheduleDatetime: Date | null;
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
  const [searchParams, setSearchParams] = useSearchParams();
  const { profile } = useAuth();
  const [inspections, setInspections] = useState<AgendaInspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(() => {
    const dateParam = searchParams.get('date');
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    if (!dateParam || dateParam === 'today') return d;
    const parsed = new Date(`${dateParam}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return d;
    parsed.setHours(0, 0, 0, 0);
    return parsed;
  });
  const scrollRef = useRef<HTMLDivElement>(null);

  const days = generateDays(14);
  const todayStr = new Date().toDateString();

  useEffect(() => {
    const dateParam = searchParams.get('date');
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    if (!dateParam || dateParam === 'today') {
      if (selectedDate.toDateString() !== d.toDateString()) setSelectedDate(d);
      return;
    }
    const parsed = new Date(`${dateParam}T00:00:00`);
    if (!Number.isNaN(parsed.getTime()) && selectedDate.toDateString() !== parsed.toDateString()) {
      parsed.setHours(0, 0, 0, 0);
      setSelectedDate(parsed);
    }
  }, [searchParams, selectedDate]);

  useEffect(() => {
    const dayKey = selectedDate.toISOString().slice(0, 10);
    const selectedEl = scrollRef.current?.querySelector<HTMLButtonElement>(`button[data-day-key='${dayKey}']`);
    selectedEl?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [selectedDate]);

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
              data-day-key={day.toISOString().slice(0, 10)}
              onClick={() => {
                setSelectedDate(day);
                const params = new URLSearchParams(searchParams);
                params.set('date', day.toDateString() === todayStr ? 'today' : day.toISOString().slice(0, 10));
                setSearchParams(params, { replace: true });
              }}
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
      <main className="px-4 space-y-4">
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
            <div className="space-y-3">
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
  const displayState = getInspectorDisplayState(insp, insp.completedSections, insp.totalSections);
  const cta = displayState.key === 'ready_to_submit'
    ? 'Revisar'
    : displayState.key === 'assigned'
      ? 'Iniciar'
      : displayState.key === 'needs_changes'
        ? 'Corregir'
        : 'Continuar';

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
          <InspectorStatusBadge state={displayState} />
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
