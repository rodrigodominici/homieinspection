import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, Camera } from 'lucide-react';
import type { Inspection, Profile } from '@/lib/types';
import {
  evaluateStall, stallTone, STALL_REASON_LABEL, STALL_THRESHOLD_DAYS,
  type StalledReason, type StalledInfo,
} from '@/lib/inspection-stalled';
import { getInspectionTypeLabel } from '@/lib/inspection-type-labels';
import { useInspectionProgress } from '@/hooks/useInspectionProgress';
import { cn } from '@/lib/utils';

interface Props {
  inspections: Inspection[];
  profileMap: Map<string, Profile>;
}

const FILTERS: { value: StalledReason | 'all'; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'not_started', label: STALL_REASON_LABEL.not_started },
  { value: 'in_progress', label: STALL_REASON_LABEL.in_progress },
  { value: 'review', label: STALL_REASON_LABEL.review },
];

export default function StalledInspectionsPanel({ inspections, profileMap }: Props) {
  const [filter, setFilter] = useState<StalledReason | 'all'>('all');

  const stalled = useMemo(() => {
    const rows: { insp: Inspection; info: StalledInfo }[] = [];
    for (const insp of inspections) {
      const info = evaluateStall(insp);
      if (info?.stalled) rows.push({ insp, info });
    }
    return rows.sort((a, b) => b.info.idleDays - a.info.idleDays);
  }, [inspections]);

  const counts = useMemo(() => {
    const c: Record<StalledReason, number> = { not_started: 0, in_progress: 0, review: 0 };
    for (const r of stalled) c[r.info.reason]++;
    return c;
  }, [stalled]);

  const visible = useMemo(
    () => (filter === 'all' ? stalled : stalled.filter((r) => r.info.reason === filter)),
    [stalled, filter],
  );

  const { data: progress } = useInspectionProgress(visible.slice(0, 30).map((r) => r.insp.id));

  return (
    <Card className="border-0 ring-1 ring-border shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-status-bad" />
            Inspecciones incompletas
            <span className="text-tiny font-normal text-muted-foreground">
              ({stalled.length} sin actividad)
            </span>
          </CardTitle>
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <Button
                key={f.value}
                size="sm"
                variant={filter === f.value ? 'default' : 'outline'}
                className="h-7 text-xs"
                onClick={() => setFilter(f.value)}
              >
                {f.label}
                {f.value !== 'all' && ` (${counts[f.value as StalledReason]})`}
              </Button>
            ))}
          </div>
        </div>
        <p className="text-tiny text-muted-foreground">
          Umbrales: sin iniciar {STALL_THRESHOLD_DAYS.not_started}d · iniciada{' '}
          {STALL_THRESHOLD_DAYS.in_progress}d · cotización {STALL_THRESHOLD_DAYS.review}d
        </p>
      </CardHeader>
      <CardContent>
        {visible.length === 0 ? (
          <p className="text-caption text-muted-foreground">Sin inspecciones estancadas ✓</p>
        ) : (
          <div className="divide-y divide-border">
            {visible.slice(0, 30).map(({ insp, info }) => {
              const p = progress?.[insp.id];
              const pct = p && p.totalSections > 0
                ? Math.round((p.doneSections / p.totalSections) * 100)
                : 0;
              return (
                <div key={insp.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/admin/inspections/${insp.id}`}
                        className="text-sm font-medium truncate hover:underline"
                      >
                        {insp.property_name ?? insp.property_id}
                      </Link>
                      <span className="text-tiny text-muted-foreground whitespace-nowrap">
                        {getInspectionTypeLabel(insp.inspection_type)}
                      </span>
                    </div>
                    <p className="text-tiny text-muted-foreground truncate">
                      {STALL_REASON_LABEL[info.reason]}
                      {' · '}
                      {profileMap.get(insp.inspector_id ?? '')?.full_name ?? 'Sin inspector'}
                      {' / '}
                      {profileMap.get(insp.executive_id ?? '')?.full_name ?? 'Sin ejecutivo'}
                    </p>
                  </div>

                  <div className="hidden sm:block w-36 shrink-0">
                    <Progress value={pct} className="h-1.5" />
                    <p className="mt-1 text-tiny text-muted-foreground flex items-center gap-2">
                      <span>{p ? `${p.doneSections}/${p.totalSections} secciones` : '—'}</span>
                      <span className="inline-flex items-center gap-1">
                        <Camera className="h-3 w-3" />{p?.photos ?? 0}
                      </span>
                    </p>
                  </div>

                  <div className={cn('w-20 shrink-0 text-right text-sm font-semibold', stallTone(info))}>
                    {info.idleDays}d
                    <span className="block text-tiny font-normal text-muted-foreground">sin actividad</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
