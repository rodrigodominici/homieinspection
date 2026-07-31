import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { Gauge, Info } from 'lucide-react';

/** One aggregated row per executive, returned by `get_executive_performance()`. */
export interface ExecPerformanceRow {
  executive_id: string;
  executive_name: string;
  assigned: number;
  published: number;
  median_hours_to_review: number | null;
  median_hours_to_publish: number | null;
  report_versions: number;
  inspections_with_versions: number;
  versions_per_report: number | null;
  repair_items: number;
  inspections_with_items: number;
  items_per_inspection: number | null;
  client_amount: number;
  contractor_cost: number;
  margin_pct: number | null;
  owner_responded: number;
  owner_accepted: number;
  owner_no_response: number;
  median_days_owner_response: number | null;
}

type MetricKey = 'speed' | 'budget' | 'owner';

const METRIC_TABS: { key: MetricKey; label: string }[] = [
  { key: 'speed', label: 'Velocidad' },
  { key: 'budget', label: 'Presupuesto' },
  { key: 'owner', label: 'Propietario' },
];

async function fetchExecutivePerformance(): Promise<ExecPerformanceRow[]> {
  const { data, error } = await supabase.rpc('get_executive_performance');
  if (error) throw error;
  return (data ?? []) as unknown as ExecPerformanceRow[];
}

function fmtHours(h: number | null): string {
  if (h === null || h === undefined) return '—';
  if (h < 24) return `${Math.round(h)} h`;
  return `${(h / 24).toFixed(1)} d`;
}

function fmtDays(d: number | null): string {
  if (d === null || d === undefined) return '—';
  return `${d} d`;
}

function fmtMoney(v: number): string {
  if (!v) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)} M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)} K`;
  return `$${Math.round(v)}`;
}

function fmtNum(v: number | null): string {
  if (v === null || v === undefined) return '—';
  return String(v);
}

/** Small horizontal bar used to compare a value against the row maximum. */
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

export default function ExecutivePerformancePanel() {
  const [metric, setMetric] = useState<MetricKey>('speed');

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'dashboard', 'executive-performance'],
    queryFn: fetchExecutivePerformance,
    staleTime: 60_000,
  });

  const rows = useMemo(
    () => (data ?? []).filter((r) => r.assigned > 0),
    [data],
  );

  const max = useMemo(() => {
    const m = {
      review: 0, publish: 0, versions: 0, items: 0, amount: 0, accepted: 0, noResponse: 0,
    };
    for (const r of rows) {
      m.review = Math.max(m.review, r.median_hours_to_review ?? 0);
      m.publish = Math.max(m.publish, r.median_hours_to_publish ?? 0);
      m.versions = Math.max(m.versions, r.versions_per_report ?? 0);
      m.items = Math.max(m.items, r.items_per_inspection ?? 0);
      m.amount = Math.max(m.amount, r.client_amount);
      m.accepted = Math.max(m.accepted, r.owner_accepted);
      m.noResponse = Math.max(m.noResponse, r.owner_no_response);
    }
    return m;
  }, [rows]);

  return (
    <Card className="border-0 ring-1 ring-border shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <Gauge className="h-4 w-4 text-muted-foreground" />
              Desempeño por ejecutivo
            </CardTitle>
            <p className="text-caption text-muted-foreground pt-1">
              Medianas del ciclo, retrabajo de informes, presupuesto y cierre con el propietario.
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
            No se pudieron cargar las métricas de ejecutivos.
          </p>
        ) : rows.length === 0 ? (
          <p className="text-caption text-muted-foreground py-6 text-center">
            Aún no hay inspecciones asignadas a ejecutivos.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <HeadCell label="Ejecutivo" />
                  <HeadCell label="Asignadas" />
                  <HeadCell label="Publicadas" />
                  {metric === 'speed' && (
                    <>
                      <HeadCell
                        label="A revisión"
                        hint="Mediana entre el envío del inspector y el cierre de la revisión."
                      />
                      <HeadCell
                        label="A publicación"
                        hint="Mediana entre el envío del inspector y la publicación del informe."
                      />
                      <HeadCell
                        label="Versiones/informe"
                        hint="Cuántas veces se republica en promedio cada informe. Más alto = más retrabajo."
                      />
                    </>
                  )}
                  {metric === 'budget' && (
                    <>
                      <HeadCell label="Ítems/inspección" hint="Partidas de reparación promedio por inspección presupuestada." />
                      <HeadCell label="Monto cliente" />
                      <HeadCell label="Costo contratista" />
                      <HeadCell label="Margen" hint="(Monto cliente − costo contratista) / monto cliente." />
                    </>
                  )}
                  {metric === 'owner' && (
                    <>
                      <HeadCell label="Respondidas" hint="Publicadas en las que el propietario ya envió su feedback." />
                      <HeadCell label="Aceptadas" />
                      <HeadCell label="Sin respuesta" hint="Publicadas que siguen esperando al propietario." />
                      <HeadCell label="Respuesta propietario" hint="Mediana de días entre la publicación y la respuesta del propietario." />
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const acceptRate =
                    r.owner_responded > 0
                      ? Math.round((r.owner_accepted / r.owner_responded) * 100)
                      : null;
                  return (
                    <tr key={r.executive_id} className="border-b border-border/60 last:border-0">
                      <td className="px-2 py-2.5 max-w-[180px]">
                        <Link
                          to={`/admin/inspections?executive=${r.executive_id}`}
                          className="text-sm font-medium truncate hover:text-primary block"
                          title={r.executive_name}
                        >
                          {r.executive_name}
                        </Link>
                      </td>
                      <td className="px-2 py-2.5 text-sm tabular-nums">{r.assigned}</td>
                      <td className="px-2 py-2.5 text-sm tabular-nums">{r.published}</td>

                      {metric === 'speed' && (
                        <>
                          <td className="px-2 py-2.5 min-w-[90px]">
                            <span className="text-sm tabular-nums">{fmtHours(r.median_hours_to_review)}</span>
                            <MiniBar value={r.median_hours_to_review ?? 0} max={max.review} tone="primary" />
                          </td>
                          <td className="px-2 py-2.5 min-w-[90px]">
                            <span className="text-sm tabular-nums">{fmtHours(r.median_hours_to_publish)}</span>
                            <MiniBar value={r.median_hours_to_publish ?? 0} max={max.publish} tone="primary" />
                          </td>
                          <td className="px-2 py-2.5 min-w-[90px]">
                            <span className="text-sm tabular-nums">{fmtNum(r.versions_per_report)}</span>
                            <MiniBar value={r.versions_per_report ?? 0} max={max.versions} tone="bad" />
                          </td>
                        </>
                      )}

                      {metric === 'budget' && (
                        <>
                          <td className="px-2 py-2.5 min-w-[90px]">
                            <span className="text-sm tabular-nums">{fmtNum(r.items_per_inspection)}</span>
                            <MiniBar value={r.items_per_inspection ?? 0} max={max.items} tone="primary" />
                          </td>
                          <td className="px-2 py-2.5 min-w-[90px]">
                            <span className="text-sm tabular-nums">{fmtMoney(Number(r.client_amount))}</span>
                            <MiniBar value={Number(r.client_amount)} max={max.amount} tone="accent" />
                          </td>
                          <td className="px-2 py-2.5 text-sm tabular-nums">
                            {fmtMoney(Number(r.contractor_cost))}
                          </td>
                          <td className="px-2 py-2.5">
                            <span
                              className={cn(
                                'text-sm font-semibold tabular-nums',
                                r.margin_pct !== null && r.margin_pct < 60 ? 'text-status-bad' : 'text-accent',
                              )}
                            >
                              {r.margin_pct === null ? '—' : `${r.margin_pct}%`}
                            </span>
                          </td>
                        </>
                      )}

                      {metric === 'owner' && (
                        <>
                          <td className="px-2 py-2.5 text-sm tabular-nums">{r.owner_responded}</td>
                          <td className="px-2 py-2.5 min-w-[90px]">
                            <span className="text-sm tabular-nums">
                              {r.owner_accepted}
                              {acceptRate !== null && (
                                <span className="text-tiny text-muted-foreground"> ({acceptRate}%)</span>
                              )}
                            </span>
                            <MiniBar value={r.owner_accepted} max={max.accepted} tone="accent" />
                          </td>
                          <td className="px-2 py-2.5 min-w-[90px]">
                            <span className="text-sm tabular-nums">{r.owner_no_response}</span>
                            <MiniBar value={r.owner_no_response} max={max.noResponse} tone="bad" />
                          </td>
                          <td className="px-2 py-2.5 text-sm tabular-nums">
                            {fmtDays(r.median_days_owner_response)}
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
