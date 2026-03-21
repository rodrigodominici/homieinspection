import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { InspectionStatusBadge } from '@/components/StatusBadge';
import { Skeleton } from '@/components/ui/skeleton';
import AdminLayout from '@/components/AdminLayout';
import type { Inspection } from '@/lib/types';
import { CalendarClock, MapPin, Clock, User } from 'lucide-react';

interface ScheduledInspection extends Inspection {
  scheduleDatetime: Date | null;
  inspectorName: string | null;
}

export default function AdminSchedule() {
  const [inspections, setInspections] = useState<ScheduledInspection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('inspections')
        .select('*, inspector:profiles!inspections_inspector_id_fkey(full_name)')
        .order('scheduled_at', { ascending: true });

      const items = ((data ?? []) as unknown as (Inspection & { inspector: { full_name: string } | null })[]).map((insp) => {
        const snapshot = insp.property_snapshot_json as Record<string, unknown>;
        const fecha = snapshot?.fecha_recoleccion_llaves as string | undefined;
        const hora = snapshot?.hora_recoleccion_llaves as string | undefined;
        let scheduleDatetime: Date | null = null;
        if (fecha) {
          scheduleDatetime = new Date(`${fecha}T${hora || '00:00'}`);
          if (isNaN(scheduleDatetime.getTime())) scheduleDatetime = null;
        } else if (insp.scheduled_at) {
          scheduleDatetime = new Date(insp.scheduled_at);
          if (isNaN(scheduleDatetime.getTime())) scheduleDatetime = null;
        }
        return {
          ...insp,
          scheduleDatetime,
          inspectorName: insp.inspector?.full_name ?? null,
        };
      });

      // Sort by schedule date
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

  const now = new Date();
  const upcoming = inspections.filter(i => i.scheduleDatetime && i.scheduleDatetime >= now);
  const past = inspections.filter(i => i.scheduleDatetime && i.scheduleDatetime < now);
  const unscheduled = inspections.filter(i => !i.scheduleDatetime);

  return (
    <AdminLayout>
      <div className="p-6 max-w-5xl space-y-6">
        <h1 className="text-h2">Agenda de Recolecciones</h1>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        ) : (
          <>
            {/* Upcoming */}
            <section>
              <h2 className="text-caption font-medium text-muted-foreground uppercase tracking-wider mb-3">
                Próximas ({upcoming.length})
              </h2>
              {upcoming.length === 0 ? (
                <Card className="border-0 ring-1 ring-border shadow-sm">
                  <CardContent className="py-8 text-center text-muted-foreground">No hay recolecciones próximas</CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {upcoming.map((insp) => <ScheduleCard key={insp.id} inspection={insp} />)}
                </div>
              )}
            </section>

            {/* Past */}
            {past.length > 0 && (
              <section>
                <h2 className="text-caption font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  Pasadas ({past.length})
                </h2>
                <div className="space-y-3">
                  {past.map((insp) => <ScheduleCard key={insp.id} inspection={insp} />)}
                </div>
              </section>
            )}

            {/* Unscheduled */}
            {unscheduled.length > 0 && (
              <section>
                <h2 className="text-caption font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  Sin Programar ({unscheduled.length})
                </h2>
                <div className="space-y-3">
                  {unscheduled.map((insp) => <ScheduleCard key={insp.id} inspection={insp} />)}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}

function ScheduleCard({ inspection: insp }: { inspection: ScheduledInspection }) {
  return (
    <Card className="border-0 ring-1 ring-border shadow-sm">
      <CardContent className="py-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1 flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-medium truncate">{insp.property_name ?? insp.property_id}</p>
              <InspectionStatusBadge status={insp.status} />
            </div>
            <div className="flex items-center gap-1 text-caption text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{insp.address ?? 'Sin dirección'}</span>
            </div>
            <div className="flex items-center gap-4 text-tiny text-muted-foreground">
              {insp.scheduleDatetime && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {insp.scheduleDatetime.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' })} · {insp.scheduleDatetime.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              {insp.inspectorName && (
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {insp.inspectorName}
                </span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
