import { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { InspectionStatusBadge } from '@/components/StatusBadge';
import { Skeleton } from '@/components/ui/skeleton';
import ExecutiveLayout from '@/components/ExecutiveLayout';
import { getEffectiveSnapshot } from '@/lib/inspection-utils';
import {
  getContractDateMicroLabel,
  getContractDateShortLabel,
  getInspectionTypeLabel,
} from '@/lib/inspection-type-labels';
import {
  isTerminalScheduleStatus,
  getTypeVisualTokens,
  formatScheduleDate,
  getProximityBucket,
  PROXIMITY_LABELS,
  type ScheduleTypeFilter,
  type ProximityBucket,
} from '@/lib/schedule-helpers';
import type { Inspection, Profile } from '@/lib/types';
import { ChevronLeft, ChevronRight, MapPin, User, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ScheduledInspection extends Inspection {
  scheduleDatetime: Date | null;
  contractEndDate: Date | null;
  inspectorName: string | null;
}

const HOURS = Array.from({ length: 13 }, (_, i) => i + 8);

function getMonday(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d);
  monday.setDate(diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

const DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

type ScheduleFilter = 'all' | 'programmed' | 'to_coordinate';

export default function ExecutiveSchedule() {
  const [inspections, setInspections] = useState<ScheduledInspection[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [searchParams, setSearchParams] = useSearchParams();
  const filterInspector = searchParams.get('inspector') ?? 'all';
  const filterExecutive = searchParams.get('exec') ?? 'all';
  const setFilterInspector = (v: string) => {
    const next = new URLSearchParams(searchParams);
    if (v === 'all') next.delete('inspector'); else next.set('inspector', v);
    setSearchParams(next, { replace: true });
  };
  const setFilterExecutive = (v: string) => {
    const next = new URLSearchParams(searchParams);
    if (v === 'all') next.delete('exec'); else next.set('exec', v);
    setSearchParams(next, { replace: true });
  };
  const [scheduleFilter, setScheduleFilter] = useState<ScheduleFilter>('all');
  const [typeFilter, setTypeFilter] = useState<ScheduleTypeFilter>('all');

  useEffect(() => {
    const load = async () => {
      const [inspRes, profilesRes] = await Promise.all([
        supabase
          .from('inspections')
          .select('*, inspector:profiles!inspections_inspector_id_fkey(full_name)')
          .order('updated_at', { ascending: false }),
        supabase.from('profiles').select('*').eq('is_active', true).order('full_name'),
      ]);

      const items = ((inspRes.data ?? []) as unknown as (Inspection & { inspector: { full_name: string } | null })[]).map((insp) => {
        const snapshot = getEffectiveSnapshot(insp);
        const fecha = snapshot?.fecha_recoleccion_llaves as string | undefined;
        const hora = snapshot?.hora_recoleccion_llaves as string | undefined;
        let scheduleDatetime: Date | null = null;
        if (fecha) {
          scheduleDatetime = new Date(`${fecha}T${hora || '00:00'}`);
          if (isNaN(scheduleDatetime.getTime())) scheduleDatetime = null;
        }
        let contractEndDate: Date | null = null;
        const contractEnd = snapshot?.fecha_de_termino_real_de_contrato as string | undefined;
        if (contractEnd) {
          contractEndDate = new Date(`${contractEnd}T00:00:00`);
          if (isNaN(contractEndDate.getTime())) contractEndDate = null;
        }
        return { ...insp, scheduleDatetime, contractEndDate, inspectorName: insp.inspector?.full_name ?? null };
      });

      setInspections(items);
      setProfiles((profilesRes.data ?? []) as unknown as Profile[]);
      setLoading(false);
    };
    load();
  }, []);

  const executivesList = profiles.filter(p => p.role === 'executive');
  const linkedInspectorIds = useMemo(() => {
    const ids = new Set<string>();
    for (const i of inspections) if (i.inspector_id) ids.add(i.inspector_id);
    return ids;
  }, [inspections]);
  const inspectorsList = useMemo(
    () => profiles.filter(p => p.role === 'inspector' && linkedInspectorIds.has(p.id)),
    [profiles, linkedInspectorIds],
  );
  const uniqueExecutives = useMemo(() => {
    const ids = new Set(inspections.map(i => (i as any).executive_id).filter(Boolean));
    return ids.size;
  }, [inspections]);
  const showInspectorFilter = inspectorsList.length > 0;
  const showExecutiveFilter = uniqueExecutives > 1;

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = new Date().toDateString();

  // A) Excluir estados terminales del calendario operativo.
  const operational = inspections.filter(i => !isTerminalScheduleStatus(i.status));
  const terminalCount = inspections.length - operational.length;

  const filtered = operational.filter(i => {
    if (filterInspector !== 'all' && i.inspector_id !== filterInspector) return false;
    if (filterExecutive !== 'all' && (i as any).executive_id !== filterExecutive) return false;
    if (typeFilter !== 'all') {
      const t = i.inspection_type === 'captacion' ? 'captacion' : 'check_out';
      if (t !== typeFilter) return false;
    }
    return true;
  });

  const programmed = filtered.filter(i => i.scheduleDatetime);
  const toCoordinate = filtered.filter(i => !i.scheduleDatetime && i.contractEndDate);
  const unscheduled = filtered.filter(i => !i.scheduleDatetime && !i.contractEndDate);

  const grid = useMemo(() => {
    const map: Map<string, ScheduledInspection[]> = new Map();
    if (scheduleFilter === 'to_coordinate') return map;
    for (const insp of programmed) {
      const dt = insp.scheduleDatetime!;
      const dayKey = dt.toDateString();
      const hour = dt.getHours();
      const key = `${dayKey}-${hour}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(insp);
    }
    return map;
  }, [programmed, scheduleFilter]);

  const coordinationByDay = useMemo(() => {
    const map: Map<string, ScheduledInspection[]> = new Map();
    if (scheduleFilter === 'programmed') return map;
    for (const insp of toCoordinate) {
      const dayKey = insp.contractEndDate!.toDateString();
      if (!map.has(dayKey)) map.set(dayKey, []);
      map.get(dayKey)!.push(insp);
    }
    return map;
  }, [toCoordinate, scheduleFilter]);

  const hasCoordinationRow = weekDays.some(d => (coordinationByDay.get(d.toDateString()) ?? []).length > 0);

  const weekDayStrings = new Set(weekDays.map(d => d.toDateString()));
  const toCoordinateBottomRaw = toCoordinate
    .filter(i => !weekDayStrings.has(i.contractEndDate!.toDateString()))
    .sort((a, b) => a.contractEndDate!.getTime() - b.contractEndDate!.getTime());

  const toCoordinateGroups = useMemo(() => {
    const groups: Record<ProximityBucket, ScheduledInspection[]> = {
      overdue: [], this_week: [], upcoming: [],
    };
    for (const insp of toCoordinateBottomRaw) {
      const bucket = getProximityBucket(insp.contractEndDate!, weekStart);
      groups[bucket].push(insp);
    }
    return groups;
  }, [toCoordinateBottomRaw, weekStart]);

  return (
    <ExecutiveLayout>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-h2">Agenda de Inspecciones</h1>
          <div className="flex items-center gap-2 flex-wrap">
            {showExecutiveFilter && (
              <Select value={filterExecutive} onValueChange={setFilterExecutive}>
                <SelectTrigger className="w-[200px]"><SelectValue placeholder="Filtrar ejecutivo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los ejecutivos</SelectItem>
                  {executivesList.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {showInspectorFilter && (
              <Select value={filterInspector} onValueChange={setFilterInspector}>
                <SelectTrigger className="w-[200px]"><SelectValue placeholder="Filtrar inspector" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los inspectores</SelectItem>
                  {inspectorsList.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {/* Filter pills */}
        <div className="flex items-center gap-2">
          {([
            { value: 'all' as const, label: 'Todas' },
            { value: 'programmed' as const, label: 'Programadas' },
            { value: 'to_coordinate' as const, label: 'Por coordinar' },
          ]).map(pill => (
            <Button
              key={pill.value}
              variant={scheduleFilter === pill.value ? 'default' : 'outline'}
              size="sm"
              className="rounded-full h-8 px-4 text-xs"
              onClick={() => setScheduleFilter(pill.value)}
            >
              {pill.label}
            </Button>
          ))}
        </div>

        {/* Week navigation */}
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => setWeekStart(addDays(weekStart, -7))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(getMonday(new Date()))}>
            Hoy
          </Button>
          <Button variant="outline" size="icon" onClick={() => setWeekStart(addDays(weekStart, 7))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            {weekStart.toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })} — {addDays(weekStart, 6).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
        </div>

        {loading ? (
          <Skeleton className="h-96 rounded-xl" />
        ) : (
          <>
            <div className="border rounded-xl overflow-auto">
              <div className="grid grid-cols-[60px_repeat(7,1fr)] min-w-[900px]">
                <div className="border-b border-r bg-muted/30 p-2" />
                {weekDays.map((day, i) => (
                  <div
                    key={i}
                    className={cn(
                      "border-b border-r p-2 text-center",
                      day.toDateString() === today && "bg-primary/5"
                    )}
                  >
                    <p className="text-tiny font-medium text-muted-foreground">{DAY_LABELS[i]}</p>
                    <p className={cn(
                      "text-sm font-semibold",
                      day.toDateString() === today && "text-primary"
                    )}>{day.getDate()}</p>
                  </div>
                ))}

                {/* Coordination banner row */}
                {hasCoordinationRow && (
                  <>
                    <div className="border-b border-r bg-amber-50/50 p-1 text-tiny text-amber-700 text-right pr-2 flex items-start justify-end pt-1 font-medium">
                      Coord.
                    </div>
                    {weekDays.map((day, dayIdx) => {
                      const items = coordinationByDay.get(day.toDateString()) ?? [];
                      return (
                        <div
                          key={`coord-${dayIdx}`}
                          className={cn(
                            "border-b border-r p-0.5 min-h-[40px] bg-amber-50/30",
                            day.toDateString() === today && "bg-amber-50/50"
                          )}
                        >
                          {items.map(insp => (
                            <a
                              key={insp.id}
                              href={`/executive/inspection/${insp.id}`}
                              className="block rounded-md border border-dashed border-amber-300 bg-amber-50 text-amber-800 px-1.5 py-1 text-[10px] leading-tight hover:bg-amber-100 transition-colors mb-0.5"
                              title={`${insp.property_name ?? insp.property_id} — Por coordinar`}
                            >
                              <span className="font-semibold">Por coordinar</span>
                              <span className="block truncate font-medium">{insp.property_name ?? insp.property_id}</span>
                              <span className="block truncate text-amber-600">
                                {getContractDateMicroLabel(insp.inspection_type)}: {insp.contractEndDate!.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
                              </span>
                              {insp.inspectorName && <span className="block text-amber-500 truncate">{insp.inspectorName}</span>}
                            </a>
                          ))}
                        </div>
                      );
                    })}
                  </>
                )}

                {scheduleFilter !== 'to_coordinate' && HOURS.map((hour) => (
                  <div key={`row-${hour}`} className="contents">
                    <div className="border-b border-r p-1 text-tiny text-muted-foreground text-right pr-2 h-16 flex items-start justify-end pt-1">
                      {hour}:00
                    </div>
                    {weekDays.map((day, dayIdx) => {
                      const key = `${day.toDateString()}-${hour}`;
                      const items = grid.get(key) ?? [];
                      return (
                        <div
                          key={`${hour}-${dayIdx}`}
                          className={cn(
                            "border-b border-r h-16 p-0.5 overflow-hidden",
                            day.toDateString() === today && "bg-primary/[0.02]"
                          )}
                        >
                          {items.map((insp) => (
                            <a
                              key={insp.id}
                              href={`/executive/inspection/${insp.id}`}
                              className="block rounded-md bg-primary/10 text-primary px-1.5 py-0.5 text-[10px] leading-tight truncate hover:bg-primary/20 transition-colors mb-0.5"
                              title={`${insp.property_name ?? insp.property_id} — ${insp.inspectorName ?? 'Sin inspector'}`}
                            >
                              <span className="font-medium">{insp.property_name ?? insp.property_id}</span>
                              <span className="block text-muted-foreground truncate">
                                Inspección: {insp.scheduleDatetime!.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              {insp.inspectorName && <span className="block text-muted-foreground truncate">{insp.inspectorName}</span>}
                            </a>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* Por coordinar bottom */}
            {scheduleFilter !== 'programmed' && toCoordinateBottom.length > 0 && (
              <section>
                <h2 className="text-caption font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  Por coordinar ({toCoordinateBottom.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {toCoordinateBottom.map((insp) => (
                    <a key={insp.id} href={`/executive/inspection/${insp.id}`}>
                      <Card className="border-0 ring-1 ring-amber-200 shadow-sm hover:shadow-md transition-shadow border-dashed">
                        <CardContent className="py-3">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 rounded-full px-2 py-0.5">
                              Por coordinar
                            </span>
                          </div>
                          <p className="font-medium text-sm truncate">{insp.property_name ?? insp.property_id}</p>
                          <div className="flex items-center gap-1 text-tiny text-muted-foreground mt-1">
                            <MapPin className="h-3 w-3" /> <span className="truncate">{insp.address ?? 'Sin dirección'}</span>
                          </div>
                          <div className="flex items-center gap-1 text-tiny text-amber-700 mt-1">
                            <FileText className="h-3 w-3" />
                            <span>{getContractDateShortLabel(insp.inspection_type)}: {insp.contractEndDate!.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                          </div>
                          {insp.inspectorName && (
                            <span className="text-tiny text-muted-foreground flex items-center gap-1 mt-1">
                              <User className="h-3 w-3" /> {insp.inspectorName}
                            </span>
                          )}
                        </CardContent>
                      </Card>
                    </a>
                  ))}
                </div>
              </section>
            )}

            {/* Sin programar */}
            {scheduleFilter !== 'programmed' && unscheduled.length > 0 && (
              <section>
                <h2 className="text-caption font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  Sin programar ({unscheduled.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {unscheduled.map((insp) => (
                    <a key={insp.id} href={`/executive/inspection/${insp.id}`}>
                      <Card className="border-0 ring-1 ring-border shadow-sm hover:shadow-md transition-shadow">
                        <CardContent className="py-3">
                          <p className="font-medium text-sm truncate">{insp.property_name ?? insp.property_id}</p>
                          <div className="flex items-center gap-1 text-tiny text-muted-foreground mt-1">
                            <MapPin className="h-3 w-3" /> <span className="truncate">{insp.address ?? 'Sin dirección'}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <InspectionStatusBadge status={insp.status} />
                            {insp.inspectorName && (
                              <span className="text-tiny text-muted-foreground flex items-center gap-1">
                                <User className="h-3 w-3" /> {insp.inspectorName}
                              </span>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </a>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </ExecutiveLayout>
  );
}
