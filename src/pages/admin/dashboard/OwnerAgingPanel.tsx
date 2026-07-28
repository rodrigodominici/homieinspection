import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/shared/ui';
import { Hourglass, MessageSquareWarning, Clock } from 'lucide-react';
import type { Inspection, Profile } from '@/lib/types';
import { stageOf } from '@/lib/inspection-buckets';

interface Props {
  inspections: Inspection[];
  profileMap: Map<string, Profile>;
}

type Mode = 'waitingOwner' | 'ownerFeedback';

const BUCKETS: { key: string; label: string; min: number; max: number }[] = [
  { key: '0-2',   label: '0–2 días',   min: 0,  max: 2 },
  { key: '3-5',   label: '3–5 días',   min: 3,  max: 5 },
  { key: '6-10',  label: '6–10 días',  min: 6,  max: 10 },
  { key: '11-20', label: '11–20 días', min: 11, max: 20 },
  { key: '20+',   label: '20+ días',   min: 21, max: Infinity },
];

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24)));
}

function bucketFor(days: number) {
  return BUCKETS.find((b) => days >= b.min && days <= b.max)!;
}

function ageTone(days: number): string {
  if (days <= 2) return 'text-primary';
  if (days <= 5) return 'text-primary';
  if (days <= 10) return 'text-status-regular';
  return 'text-status-bad';
}

export default function OwnerAgingPanel({ inspections, profileMap }: Props) {
  const [mode, setMode] = useState<Mode>('waitingOwner');
  const [activeBucket, setActiveBucket] = useState<string | null>(null);

  const rows = useMemo(() => {
    const list: { insp: Inspection; days: number }[] = [];
    for (const i of inspections) {
      const stage = stageOf(i);
      if (mode === 'waitingOwner' && stage !== 'waitingOwner') continue;
      if (mode === 'ownerFeedback' && stage !== 'ownerFeedback') continue;
      const anchor = mode === 'waitingOwner'
        ? (i.published_at ?? i.owner_url_generated_at)
        : i.owner_feedback_last_submitted_at;
      const d = daysSince(anchor);
      if (d === null) continue;
      list.push({ insp: i, days: d });
    }
    return list.sort((a, b) => b.days - a.days);
  }, [inspections, mode]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const b of BUCKETS) c[b.key] = 0;
    for (const r of rows) c[bucketFor(r.days).key]++;
    return c;
  }, [rows]);

  const avg = useMemo(() => {
    if (rows.length === 0) return 0;
    return Math.round(rows.reduce((s, r) => s + r.days, 0) / rows.length);
  }, [rows]);

  const filtered = activeBucket
    ? rows.filter((r) => bucketFor(r.days).key === activeBucket)
    : rows;

  const total = rows.length;
  const maxCount = Math.max(1, ...Object.values(counts));

  return (
    <Card className="border-0 ring-1 ring-border shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            Aging de propietario
          </CardTitle>
          <div className="inline-flex rounded-md ring-1 ring-border p-0.5 bg-muted/30">
            <button
              onClick={() => { setMode('waitingOwner'); setActiveBucket(null); }}
              className={`px-3 py-1 text-xs rounded flex items-center gap-1.5 transition-colors ${
                mode === 'waitingOwner' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Hourglass className="h-3.5 w-3.5" /> Esperando propietario
            </button>
            <button
              onClick={() => { setMode('ownerFeedback'); setActiveBucket(null); }}
              className={`px-3 py-1 text-xs rounded flex items-center gap-1.5 transition-colors ${
                mode === 'ownerFeedback' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <MessageSquareWarning className="h-3.5 w-3.5" /> Feedback propietario
            </button>
          </div>
        </div>
        <p className="text-caption text-muted-foreground mt-1">
          {mode === 'waitingOwner'
            ? 'Días desde que se publicó el presupuesto al propietario.'
            : 'Días desde que el propietario envió su feedback y espera respuesta del ejecutivo.'}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="rounded-lg ring-1 ring-border p-3 bg-muted/20">
            <p className="text-tiny text-muted-foreground">Total</p>
            <p className="text-h3 font-semibold">{total}</p>
          </div>
          <div className="rounded-lg ring-1 ring-border p-3 bg-muted/20">
            <p className="text-tiny text-muted-foreground">Promedio</p>
            <p className={`text-h3 font-semibold ${avg > 10 ? 'text-status-bad' : avg > 5 ? 'text-status-regular' : 'text-foreground'}`}>
              {avg}d
            </p>
          </div>
          {BUCKETS.map((b) => {
            const active = activeBucket === b.key;
            return (
              <button
                key={b.key}
                onClick={() => setActiveBucket(active ? null : b.key)}
                className={`rounded-lg ring-1 p-3 text-left transition-colors ${
                  active ? 'ring-primary bg-primary/5' : 'ring-border hover:bg-muted/40'
                }`}
              >
                <p className="text-tiny text-muted-foreground">{b.label}</p>
                <p className="text-h3 font-semibold">{counts[b.key]}</p>
                <div className="mt-1.5 h-1 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full ${b.min >= 11 ? 'bg-status-bad' : b.min >= 6 ? 'bg-status-regular' : 'bg-primary'}`}
                    style={{ width: `${(counts[b.key] / maxCount) * 100}%` }}
                  />
                </div>
              </button>
            );
          })}
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between mb-1">
            <p className="text-caption text-muted-foreground">
              {activeBucket ? `Mostrando ${filtered.length} en ${BUCKETS.find(b => b.key === activeBucket)?.label}` : `Todas (${filtered.length})`}
            </p>
            {activeBucket && (
              <Button variant="ghost" size="sm" onClick={() => setActiveBucket(null)}>Limpiar</Button>
            )}
          </div>
          {filtered.length === 0 ? (
            <p className="text-caption text-muted-foreground py-4 text-center">
              Sin inspecciones en este estado.
            </p>
          ) : (
            <div className="divide-y divide-border max-h-96 overflow-y-auto -mx-2">
              {filtered.slice(0, 50).map(({ insp, days }) => {
                const exec = insp.executive_id ? profileMap.get(insp.executive_id) : null;
                return (
                  <Link
                    key={insp.id}
                    to={`/admin/inspections/${insp.id}`}
                    className="flex items-center justify-between gap-3 py-2 px-2 hover:bg-muted/40 rounded"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{insp.property_name ?? insp.property_id}</p>
                      <p className="text-tiny text-muted-foreground truncate">
                        {insp.address}
                        {exec ? ` · ${exec.full_name}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusBadge inspection={insp} />
                      <span className={`text-sm font-semibold tabular-nums ${ageTone(days)}`}>
                        {days}d
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
