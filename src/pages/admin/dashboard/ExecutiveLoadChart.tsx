import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DetailSheet } from '@/shared/ui/DetailSheet';
import { StatusBadge } from '@/shared/ui';
import InspectionTypeChip from '@/components/inspector/InspectionTypeChip';
import { cn } from '@/lib/utils';
import { stageOf, STAGE_META, STAGE_ORDER, type StageKey } from '@/lib/inspection-buckets';
import { isCaptacion } from '@/lib/inspection-type-labels';
import type { Inspection, Profile } from '@/lib/types';
import { Users2 } from 'lucide-react';

type TypeFilter = 'all' | 'captacion' | 'check_out';

interface Props {
  inspections: Inspection[];
  profileMap: Map<string, Profile>;
}

interface ExecRow {
  execId: string;
  execName: string;
  total: number;
  counts: Record<StageKey, number>;
  items: Record<StageKey, Inspection[]>;
}

const UNASSIGNED_EXEC_ID = '__no_exec__';

export default function ExecutiveLoadChart({ inspections, profileMap }: Props) {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [hidden, setHidden] = useState<Set<StageKey>>(new Set());
  const [drilldown, setDrilldown] = useState<{ execId: string; stage: StageKey } | null>(null);

  const filtered = useMemo(() => {
    if (typeFilter === 'all') return inspections;
    if (typeFilter === 'captacion') return inspections.filter((i) => isCaptacion(i.inspection_type));
    return inspections.filter((i) => !isCaptacion(i.inspection_type));
  }, [inspections, typeFilter]);

  const rows = useMemo<ExecRow[]>(() => {
    const map = new Map<string, ExecRow>();
    const emptyCounts = (): Record<StageKey, number> =>
      Object.fromEntries(STAGE_ORDER.map((s) => [s, 0])) as Record<StageKey, number>;
    const emptyItems = (): Record<StageKey, Inspection[]> =>
      Object.fromEntries(STAGE_ORDER.map((s) => [s, [] as Inspection[]])) as Record<StageKey, Inspection[]>;

    for (const insp of filtered) {
      const stage = stageOf(insp);
      if (!stage || hidden.has(stage)) continue;
      const execId = insp.executive_id ?? UNASSIGNED_EXEC_ID;
      let row = map.get(execId);
      if (!row) {
        const name =
          execId === UNASSIGNED_EXEC_ID
            ? 'Sin ejecutivo asignado'
            : profileMap.get(execId)?.full_name ?? 'Ejecutivo desconocido';
        row = { execId, execName: name, total: 0, counts: emptyCounts(), items: emptyItems() };
        map.set(execId, row);
      }
      row.counts[stage]++;
      row.items[stage].push(insp);
      row.total++;
    }
    return [...map.values()]
      .filter((r) => r.total > 0)
      .sort((a, b) => {
        if (a.execId === UNASSIGNED_EXEC_ID) return 1;
        if (b.execId === UNASSIGNED_EXEC_ID) return -1;
        return b.total - a.total;
      });
  }, [filtered, hidden, profileMap]);

  const maxTotal = useMemo(() => rows.reduce((m, r) => Math.max(m, r.total), 0), [rows]);

  const toggleStage = (s: StageKey) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  const drilldownItems =
    drilldown ? rows.find((r) => r.execId === drilldown.execId)?.items[drilldown.stage] ?? [] : [];
  const drilldownRow = drilldown ? rows.find((r) => r.execId === drilldown.execId) : null;

  return (
    <>
      <Card className="border-0 ring-1 ring-border shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users2 className="h-4 w-4 text-muted-foreground" />
              Carga por ejecutivo
            </CardTitle>
            <Tabs value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
              <TabsList className="h-8">
                <TabsTrigger value="all" className="text-xs px-3">Todas</TabsTrigger>
                <TabsTrigger value="captacion" className="text-xs px-3">Captación</TabsTrigger>
                <TabsTrigger value="check_out" className="text-xs px-3">Check-out</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-x-3 gap-y-1.5 pt-2">
            {STAGE_ORDER.map((s) => {
              const meta = STAGE_META[s];
              const off = hidden.has(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleStage(s)}
                  className={cn(
                    'inline-flex items-center gap-1.5 text-tiny transition-opacity',
                    off ? 'opacity-40' : 'opacity-100',
                  )}
                  aria-pressed={!off}
                >
                  <span className={cn('h-2.5 w-2.5 rounded-sm', meta.legendDotClass)} />
                  <span className="text-muted-foreground">{meta.label}</span>
                </button>
              );
            })}
          </div>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-caption text-muted-foreground py-6 text-center">
              No hay inspecciones para este filtro.
            </p>
          ) : (
            <div className="space-y-3">
              {rows.map((row) => (
                <div key={row.execId} className="grid grid-cols-[minmax(120px,180px)_1fr_auto] items-center gap-3">
                  {row.execId === UNASSIGNED_EXEC_ID ? (
                    <span className="text-sm text-muted-foreground italic truncate">{row.execName}</span>
                  ) : (
                    <Link
                      to={`/admin/inspections?executive=${row.execId}`}
                      className="text-sm font-medium truncate hover:text-primary"
                      title={row.execName}
                    >
                      {row.execName}
                    </Link>
                  )}
                  <div
                    className="flex h-7 w-full overflow-hidden rounded-md bg-muted/40"
                    style={{ maxWidth: `${(row.total / maxTotal) * 100}%` }}
                  >
                    {STAGE_ORDER.map((s) => {
                      const count = row.counts[s];
                      if (!count) return null;
                      const pct = (count / row.total) * 100;
                      const meta = STAGE_META[s];
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setDrilldown({ execId: row.execId, stage: s })}
                          className={cn(
                            meta.colorClass,
                            'group relative h-full transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
                          )}
                          style={{ width: `${pct}%` }}
                          title={`${meta.label}: ${count}`}
                          aria-label={`${row.execName} — ${meta.label}: ${count}`}
                        >
                          {pct >= 10 && (
                            <span className="absolute inset-0 flex items-center justify-center text-tiny font-semibold text-white">
                              {count}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-muted-foreground min-w-[2ch] text-right">
                    {row.total}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <DetailSheet
        open={!!drilldown}
        onOpenChange={(o) => !o && setDrilldown(null)}
        size="lg"
        title={
          drilldown && drilldownRow
            ? `${drilldownRow.execName} — ${STAGE_META[drilldown.stage].label}`
            : ''
        }
        description={
          drilldown
            ? `${drilldownItems.length} ${drilldownItems.length === 1 ? 'propiedad' : 'propiedades'}${
                typeFilter === 'captacion' ? ' · Captación' : typeFilter === 'check_out' ? ' · Check-out' : ''
              }`
            : ''
        }
      >
        <div className="space-y-2">
          {drilldownItems.map((insp) => (
            <Link
              key={insp.id}
              to={`/admin/inspections/${insp.id}`}
              className="block rounded-md border border-border p-3 hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium truncate">
                      {insp.property_name ?? insp.property_id}
                    </p>
                    <InspectionTypeChip type={insp.inspection_type} size="xs" />
                  </div>
                  <p className="text-tiny text-muted-foreground truncate mt-0.5">{insp.address}</p>
                </div>
                <StatusBadge inspection={insp} />
              </div>
            </Link>
          ))}
        </div>
      </DetailSheet>
    </>
  );
}
