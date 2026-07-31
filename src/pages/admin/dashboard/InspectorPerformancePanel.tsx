import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { HardHat, Info } from 'lucide-react';

/** One aggregated row per inspector, returned by `get_inspector_performance()`. */
export interface InspectorPerformanceRow {
  inspector_id: string;
  inspector_name: string;
  assigned: number;
  completed: number;
  in_progress: number;
  photos: number;
  photos_per_inspection: number | null;
  fields_filled: number;
  avg_active_minutes: number | null;
  median_active_minutes: number | null;
  median_hours_to_submit: number | null;
  last_activity_at: string | null;
}

type MetricKey = 'volume' | 'time' | 'evidence';

const METRIC_TABS: { key: MetricKey; label: string }[] = [
  { key: 'volume', label: 'Volumen' },
  { key: 'time', label: 'Tiempo' },
  { key: 'evidence', label: 'Evidencia' },
];

async function fetchInspectorPerformance(): Promise<InspectorPerformanceRow[]> {
  const { data, error } = await supabase.rpc('get_inspector_performance');
  if (error) throw error;
  return (data ?? []) as unknown as InspectorPerformanceRow[];
}

function fmtMinutes(m: number | null): string {
  if (m === null || m === undefined) return '—';
  if (m < 60) return `${Math.round(m)} min`;
  const h = Math.floor(m / 60);
  const rest = Math.round(m % 60);
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

function fmtHours(h: number | null): string {
  if (h === null || h === undefined) return '—';
  if (h < 24) return `${Math.round(h)} h`;
  return `${(h / 24).toFixed(1)} d`;
}

function fmtNum(v: number | null): string {
  if (v === null || v === undefined) return '—';
  return new Intl.NumberFormat('es-CL').format(Number(v));
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
}

function MiniBar({ value, max, tone }: { value: number; max: number; tone: 'primary' | 'accent' | 'bad' }) {
  const pct = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
      <div
        className={cn(
          'h-full rounded-full',
          tone === 'primary' && 'bg-primary',
          tone === 'accent' && 'bg-accent',
          tone === 'bad' && 'bg-status-bad',
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function HeadCell({ label, hint }: { label: string; hint?: string }) {
  return (
    <th className="px-2 py-2 text-left text-tiny font-medium text-muted-foreground whitespace-nowrap">
      {hint ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-1 cursor-help">
              {label}
              <Info className="h-3 w-3 opacity-60" />
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-[240px] text-xs">{hint}</TooltipContent>
        </Tooltip>
      ) : (
        label
      )}
    </th>
  );
}

export default function InspectorPerformancePanel() {
  const [metric, setMetric] = useState<MetricKey>('volume');

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'dashboard', 'inspector-performance'],
    queryFn: fetchInspectorPerformance,
    staleTime: 60_000,
  });

  const rows = useMemo(() => (data ?? []).filter((r) => r.assigned > 0), [data]);

  const max = useMemo(() => {
    const m = { assigned: 0, photos: 0, ppi: 0, active: 0, submit: 0, fields: 0 };
    for (const r of rows) {
      m.assigned = Math.max(m.assigned, r.assigned);
      m.photos = Math.max(m.photos, r.photos);
      m.ppi = Math.max(m.ppi, Number(r.photos_per_inspection ?? 0));
      m.active = Math.max(m.active, Number(r.median_active_minutes ?? 0));
      m.submit = Math.max(m.submit, Number(r.median_hours_to_submit ?? 0));
      m.fields = Math.max(m.fields, r.fields_filled);
    }
    return m;
  }, [rows]);

  return (
    <Card className="border-0 ring-1 ring-border shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <HardHat className="h-4 w-4 text-muted-foreground" />
              Desempeño por inspector
            </CardTitle>
            <p className="text-caption text-muted-foreground pt-1">
              Volumen asignado, tiempo activo en terreno, latencia de cierre y evidencia capturada.
            </p>
          </div>
          <Tabs value={metric} onValueChange={(v) => setMetric(v as MetricKey)}>
            <TabsList className="h-8">
              {METRIC_TABS.map((t) => (
                <TabsTrigger key={t.key} value={t.key} className="text-xs px-3">
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-md" />)}
          </div>
        ) : error ? (
          <p className="text-caption text-status-bad py-6 text-center">
            No se pudieron cargar las métricas de inspectores.
          </p>
        ) : rows.length === 0 ? (
          <p className="text-caption text-muted-foreground py-6 text-center">
            Aún no hay inspecciones asignadas a inspectores.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <HeadCell label="Inspector" />
                  <HeadCell label="Asignadas" />
                  <HeadCell label="Completadas" />
                  {metric === 'volume' && (
                    <>
                      <HeadCell label="En progreso" />
                      <HeadCell label="Tasa de cierre" hint="Completadas sobre asignadas." />
                      <HeadCell label="Última actividad" hint="Última foto o campo registrado." />
                    </>
                  )}
                  {metric === 'time' && (
                    <>
                      <HeadCell
                        label="Tiempo activo (mediana)"
                        hint="Suma de intervalos de captura de fotos menores a 30 min: tiempo real trabajando en terreno."
                      />
                      <HeadCell label="Tiempo activo (promedio)" />
                      <HeadCell
                        label="Latencia de cierre"
                        hint="Mediana entre la última foto y el envío de la inspección."
                      />
                    </>
                  )}
                  {metric === 'evidence' && (
                    <>
                      <HeadCell label="Fotos" />
                      <HeadCell label="Fotos/inspección" />
                      <HeadCell label="Campos completados" hint="Respuestas registradas en los formularios." />
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const closeRate = r.assigned > 0 ? Math.round((r.completed / r.assigned) * 100) : null;
                  return (
                    <tr key={r.inspector_id} className="border-b border-border/60 last:border-0">
                      <td className="px-2 py-2.5 max-w-[180px]">
                        <Link
                          to={`/admin/inspections?inspector=${r.inspector_id}`}
                          className="text-sm font-medium truncate hover:text-primary block"
                          title={r.inspector_name}
                        >
                          {r.inspector_name}
                        </Link>
                      </td>
                      <td className="px-2 py-2.5 min-w-[80px]">
                        <span className="text-sm tabular-nums">{r.assigned}</span>
                        <MiniBar value={r.assigned} max={max.assigned} tone="primary" />
                      </td>
                      <td className="px-2 py-2.5 text-sm tabular-nums">{r.completed}</td>

                      {metric === 'volume' && (
                        <>
                          <td className="px-2 py-2.5 text-sm tabular-nums">{r.in_progress}</td>
                          <td className="px-2 py-2.5">
                            <span
                              className={cn(
                                'text-sm font-semibold tabular-nums',
                                closeRate !== null && closeRate < 60 ? 'text-status-bad' : 'text-accent',
                              )}
                            >
                              {closeRate === null ? '—' : `${closeRate}%`}
                            </span>
                          </td>
                          <td className="px-2 py-2.5 text-sm tabular-nums text-muted-foreground">
                            {fmtDate(r.last_activity_at)}
                          </td>
                        </>
                      )}

                      {metric === 'time' && (
                        <>
                          <td className="px-2 py-2.5 min-w-[110px]">
                            <span className="text-sm tabular-nums">{fmtMinutes(r.median_active_minutes)}</span>
                            <MiniBar value={Number(r.median_active_minutes ?? 0)} max={max.active} tone="primary" />
                          </td>
                          <td className="px-2 py-2.5 text-sm tabular-nums">{fmtMinutes(r.avg_active_minutes)}</td>
                          <td className="px-2 py-2.5 min-w-[100px]">
                            <span className="text-sm tabular-nums">{fmtHours(r.median_hours_to_submit)}</span>
                            <MiniBar value={Number(r.median_hours_to_submit ?? 0)} max={max.submit} tone="bad" />
                          </td>
                        </>
                      )}

                      {metric === 'evidence' && (
                        <>
                          <td className="px-2 py-2.5 min-w-[90px]">
                            <span className="text-sm tabular-nums">{fmtNum(r.photos)}</span>
                            <MiniBar value={r.photos} max={max.photos} tone="accent" />
                          </td>
                          <td className="px-2 py-2.5 min-w-[90px]">
                            <span className="text-sm tabular-nums">{fmtNum(r.photos_per_inspection)}</span>
                            <MiniBar value={Number(r.photos_per_inspection ?? 0)} max={max.ppi} tone="accent" />
                          </td>
                          <td className="px-2 py-2.5 min-w-[90px]">
                            <span className="text-sm tabular-nums">{fmtNum(r.fields_filled)}</span>
                            <MiniBar value={r.fields_filled} max={max.fields} tone="primary" />
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
