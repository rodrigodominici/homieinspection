import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { InspectionStatusBadge } from '@/components/StatusBadge';
import { Skeleton } from '@/components/ui/skeleton';
import InspectorBottomNav from '@/components/InspectorBottomNav';
import { getEffectiveSnapshot } from '@/lib/inspection-utils';
import type { Inspection } from '@/lib/types';
import { CalendarDays, MapPin, Clock, Navigation, ArrowRight } from 'lucide-react';

interface CalendarInspection extends Inspection {
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

function groupByDate(inspections: CalendarInspection[]): { label: string; key: string; items: CalendarInspection[] }[] {
  const now = new Date();
  const today = now.toDateString();
  const tomorrow = new Date(now.getTime() + 86400000).toDateString();

  const groups: Map<string, CalendarInspection[]> = new Map();
  const unscheduled: CalendarInspection[] = [];

  for (const insp of inspections) {
    if (!insp.scheduleDatetime) {
      unscheduled.push(insp);
      continue;
    }
    const key = insp.scheduleDatetime.toDateString();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(insp);
  }

  const result: { label: string; key: string; items: CalendarInspection[] }[] = [];

  // Sort date keys chronologically
  const sortedKeys = [...groups.keys()].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  for (const key of sortedKeys) {
    let label: string;
    if (key === today) label = 'Hoy';
    else if (key === tomorrow) label = 'Mañana';
    else {
      const d = new Date(key);
      label = d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
      label = label.charAt(0).toUpperCase() + label.slice(1);
    }
    result.push({ label, key, items: groups.get(key)! });
  }

  if (unscheduled.length > 0) {
    result.push({ label: 'Sin programar', key: 'unscheduled', items: unscheduled });
  }

  return result;
}

export default function InspectorCalendar() {
  const { profile } = useAuth();
  const [inspections, setInspections] = useState<CalendarInspection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('inspections')
        .select('*')
        .in('status', ['assigned', 'in_progress', 'needs_changes', 'pending_assignment'])
        .order('scheduled_at', { ascending: true });

      const items = ((data ?? []) as unknown as Inspection[]).map((insp) => ({
        ...insp,
        scheduleDatetime: getScheduleDatetime(insp),
      }));

      items.sort((a, b) => {
        if (!a.scheduleDatetime) return 1;
        if (!b.scheduleDatetime) return -1;
        return a.scheduleDatetime.getTime() - b.scheduleDatetime.getTime();
      });

      setInspections(items);
      setLoading(false);
    };
    fetch();
  }, []);

  const groups = groupByDate(inspections);

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-10 border-b bg-card/80 backdrop-blur-sm">
        <div className="flex h-16 items-center gap-3 px-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary">
            <CalendarDays className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-h4">Calendario</h1>
            <p className="text-tiny text-muted-foreground">{profile?.full_name}</p>
          </div>
        </div>
      </header>

      <main className="px-4 py-4 space-y-5">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="py-16 text-center">
            <CalendarDays className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
            <p className="text-body-lg text-muted-foreground">No tienes inspecciones pendientes</p>
          </div>
        ) : (
          groups.map((group) => (
            <section key={group.key}>
              <div className="flex items-center gap-2 mb-3">
                <div className={`h-2 w-2 rounded-full ${group.key === new Date().toDateString() ? 'bg-primary' : 'bg-muted-foreground/30'}`} />
                <h2 className="text-caption font-semibold text-muted-foreground uppercase tracking-wider">{group.label}</h2>
                <span className="text-tiny text-muted-foreground">({group.items.length})</span>
              </div>
              <div className="space-y-3">
                {group.items.map((insp) => (
                  <AgendaCard key={insp.id} inspection={insp} />
                ))}
              </div>
            </section>
          ))
        )}
      </main>

      <InspectorBottomNav />
    </div>
  );
}

function AgendaCard({ inspection: insp }: { inspection: CalendarInspection }) {
  const address = insp.address ?? 'Sin dirección';
  const snapshot = getEffectiveSnapshot(insp);
  const comuna = insp.market === 'CL' ? (snapshot?.comuna as string) ?? null : null;

  return (
    <Card className="border-0 ring-1 ring-border shadow-sm rounded-2xl active:scale-[0.99] transition-all">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1 flex-1 min-w-0">
            <p className="font-semibold truncate">{insp.property_name ?? insp.property_id}</p>
            <div className="flex items-center gap-1 text-caption text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{address}{comuna ? ` · ${comuna}` : ''}</span>
            </div>
          </div>
          <InspectionStatusBadge status={insp.status} />
        </div>

        {insp.scheduleDatetime && (
          <div className="flex items-center gap-2 text-caption text-muted-foreground bg-muted/40 rounded-xl px-3 py-2">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            <span>
              {insp.scheduleDatetime.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        )}

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
              <Navigation className="h-3.5 w-3.5" /> Cómo llegar
            </Button>
          )}
          <Link to={`/inspector/inspection/${insp.id}`} className="flex-1">
            <Button className="w-full rounded-xl gap-1.5 h-9" size="sm">
              Abrir <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
