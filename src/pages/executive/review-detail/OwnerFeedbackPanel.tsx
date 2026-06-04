/**
 * Owner feedback panel (executive view).
 *
 * Renders the propietario's per-repair decisions for the latest published
 * report version. Visible only after the owner has submitted feedback for
 * the current version.
 *
 * Data flow:
 * - Read `inspections.owner_feedback_status` + `owner_feedback_last_submitted_at`
 *   to decide whether to render and what banner color to show.
 * - Pull the latest `inspection_report_versions` row (owner audience) and its
 *   `owner_decision_summary_json` for the headline counts.
 * - Pull `inspection_owner_feedback` rows for that version_id and join them
 *   in-memory against the payload's repair entries (by repair_item_id) to
 *   surface the human-readable repair name + section title.
 *
 * Action: a single "Editar reparaciones y republicar" CTA scrolls to the
 * Cotización tab; once the executive re-publishes, the version_id changes
 * and this panel resets (no rows yet for the new version).
 */
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Check, MessageSquare, X, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

type Decision = 'accepted' | 'observed' | 'rejected';

interface FeedbackRow {
  id: string;
  repair_item_id: string;
  decision: Decision;
  comment: string | null;
  submitter_name: string | null;
  submitted_at: string;
}

interface PayloadRepair { id?: string; name: string }
interface PayloadSection { id: string; title: string; repairs: PayloadRepair[] }

interface VersionRow {
  id: string;
  version_number: number;
  normalized_payload: any;
  owner_decision_summary_json: any;
}

export function OwnerFeedbackPanel({
  inspectionId,
  ownerFeedbackStatus,
  lastSubmittedAt,
  onGoToCotizacion,
}: {
  inspectionId: string;
  ownerFeedbackStatus: 'none' | 'pending_executive_review' | 'accepted' | null | undefined;
  lastSubmittedAt: string | null | undefined;
  onGoToCotizacion?: () => void;
}) {
  const [version, setVersion] = useState<VersionRow | null>(null);
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      const { data: v } = await supabase
        .from('inspection_report_versions')
        .select('id, version_number, normalized_payload, owner_decision_summary_json')
        .eq('inspection_id', inspectionId)
        .eq('audience', 'owner')
        .eq('is_latest', true)
        .maybeSingle();
      if (cancelled || !v) { setLoading(false); return; }
      setVersion(v as any);
      const { data: fb } = await supabase
        .from('inspection_owner_feedback')
        .select('id, repair_item_id, decision, comment, submitter_name, submitted_at')
        .eq('report_version_id', (v as any).id)
        .order('submitted_at', { ascending: true });
      if (cancelled) return;
      setRows((fb ?? []) as any);
      setLoading(false);
    };
    run();
    return () => { cancelled = true; };
  }, [inspectionId, ownerFeedbackStatus, lastSubmittedAt]);

  const repairIndex = useMemo(() => {
    const map = new Map<string, { name: string; section: string }>();
    if (!version) return map;
    const sections: PayloadSection[] = version.normalized_payload?.sections ?? [];
    for (const s of sections) {
      for (const r of s.repairs ?? []) {
        if (r.id) map.set(r.id, { name: r.name, section: s.title });
      }
    }
    return map;
  }, [version]);

  if (loading) {
    return (
      <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        Cargando respuesta del propietario…
      </div>
    );
  }

  if (!version || rows.length === 0) {
    // No feedback yet for the current version
    return (
      <div className="rounded-lg border bg-card p-4">
        <p className="text-sm font-medium">Respuesta del propietario</p>
        <p className="text-xs text-muted-foreground mt-1">
          Aún no recibimos respuesta del propietario para la versión v{version?.version_number ?? '—'}.
        </p>
      </div>
    );
  }

  const summary = version.owner_decision_summary_json ?? {};
  const accepted = Number(summary.accepted ?? rows.filter(r => r.decision === 'accepted').length);
  const observed = Number(summary.observed ?? rows.filter(r => r.decision === 'observed').length);
  const rejected = Number(summary.rejected ?? rows.filter(r => r.decision === 'rejected').length);
  const total = Number(summary.total ?? rows.length);
  const allAccepted = ownerFeedbackStatus === 'accepted' || (rejected === 0 && observed === 0 && accepted === total);
  const submitter = rows[0]?.submitter_name;
  const submittedAt = rows[0]?.submitted_at;

  // Pending = anything that requires action from the executive
  const pending = rows.filter(r => r.decision !== 'accepted');

  return (
    <Card className={allAccepted ? 'border-emerald-500/40' : 'border-amber-500/40'}>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-2">
            {allAccepted
              ? <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5" />
              : <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />}
            <div>
              <CardTitle className="text-base">
                {allAccepted ? 'Propietario aceptó el reporte' : 'El propietario pidió ajustes'}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Versión v{version.version_number}
                {submitter ? ` · enviado por ${submitter}` : ''}
                {submittedAt ? ` · ${new Date(submittedAt).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}` : ''}
              </p>
            </div>
          </div>
          {!allAccepted && onGoToCotizacion && (
            <Button size="sm" variant="outline" onClick={onGoToCotizacion} className="gap-1.5 shrink-0">
              <RefreshCw className="h-3.5 w-3.5" /> Editar y republicar
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Counts */}
        <div className="grid grid-cols-3 gap-2">
          <SummaryStat label="Aceptadas" value={accepted} total={total} tone="emerald" Icon={Check} />
          <SummaryStat label="Observadas" value={observed} total={total} tone="amber" Icon={MessageSquare} />
          <SummaryStat label="Rechazadas" value={rejected} total={total} tone="red" Icon={X} />
        </div>

        {/* Pending decisions list */}
        {pending.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Reparaciones con observación o rechazo
            </p>
            <ul className="divide-y divide-border/60 rounded-md border bg-muted/20">
              {pending.map((r) => {
                const meta = repairIndex.get(r.repair_item_id);
                return (
                  <li key={r.id} className="px-3 py-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium leading-snug">{meta?.name ?? '— reparación —'}</p>
                        <p className="text-xs text-muted-foreground">{meta?.section ?? ''}</p>
                      </div>
                      <DecisionBadge decision={r.decision} />
                    </div>
                    {r.comment && (
                      <p className="text-xs text-foreground/80 italic leading-snug mt-1.5 border-l-2 border-border pl-2">
                        "{r.comment}"
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryStat({
  label, value, total, tone, Icon,
}: { label: string; value: number; total: number; tone: 'emerald' | 'amber' | 'red'; Icon: typeof Check }) {
  const toneMap = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-500/30',
    amber: 'bg-amber-50 text-amber-700 border-amber-500/30',
    red: 'bg-red-50 text-red-700 border-red-500/30',
  } as const;
  return (
    <div className={`rounded-md border px-3 py-2 ${toneMap[tone]}`}>
      <div className="flex items-center gap-1.5 text-xs">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="text-lg font-semibold mt-0.5">{value}<span className="text-xs opacity-60"> / {total}</span></div>
    </div>
  );
}

function DecisionBadge({ decision }: { decision: Decision }) {
  if (decision === 'observed') {
    return <Badge variant="outline" className="border-amber-500/40 bg-amber-50 text-amber-700 gap-1"><MessageSquare className="h-3 w-3" /> Observada</Badge>;
  }
  if (decision === 'rejected') {
    return <Badge variant="outline" className="border-red-500/40 bg-red-50 text-red-700 gap-1"><X className="h-3 w-3" /> Rechazada</Badge>;
  }
  return <Badge variant="outline" className="border-emerald-500/40 bg-emerald-50 text-emerald-700 gap-1"><Check className="h-3 w-3" /> Aceptada</Badge>;
}
