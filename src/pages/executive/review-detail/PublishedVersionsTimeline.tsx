/**
 * Timeline of every published quotation (owner audience) for an inspection.
 *
 * Each entry shows the version number, publish date, executive author and a
 * "Ver snapshot" action that opens a read-only side sheet with the totals
 * and per-section repair list captured at publish time.
 *
 * Read-only by design: public sharing remains exclusive to the latest
 * version (`is_latest = true`), so this component never exposes
 * `public_token` for older versions.
 */
import { useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye, FileText, Loader2, CheckCircle2, UserCheck } from 'lucide-react';
import { useReportVersionsHistory, type ReportVersionHistoryEntry } from '@/modules/review/api/useReportVersionsHistory';

const fmtMoney = (n: number) =>
  `$${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });

export function PublishedVersionsTimeline({ inspectionId }: { inspectionId: string }) {
  const { data, isLoading } = useReportVersionsHistory(inspectionId);
  const [selected, setSelected] = useState<ReportVersionHistoryEntry | null>(null);

  if (isLoading) {
    return (
      <div className="rounded-lg border bg-card p-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando historial de cotizaciones…
      </div>
    );
  }

  const versions = data ?? [];
  if (versions.length === 0) return null;

  return (
    <>
      <div className="rounded-lg border bg-card">
        <div className="px-4 py-2.5 border-b flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
            Historial de cotizaciones publicadas
          </p>
          <span className="text-[10px] text-muted-foreground">{versions.length} {versions.length === 1 ? 'versión' : 'versiones'}</span>
        </div>
        <ol className="divide-y divide-border/60">
          {versions.map((v) => (
            <li key={v.id} className="px-4 py-3 flex items-start gap-3">
              <div className="mt-1 flex flex-col items-center">
                <span className={`h-2 w-2 rounded-full ${v.is_latest ? 'bg-primary' : 'bg-muted-foreground/40'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium">v{v.version_number}</p>
                  {v.is_latest && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Vigente</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {fmtDateTime(v.created_at)}
                  {v.published_by_name ? ` · ${v.published_by_name}` : ''}
                </p>
                {v.approved_at && (
                  <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">
                    {v.approval_kind === 'manual'
                      ? <UserCheck className="h-3 w-3" />
                      : <CheckCircle2 className="h-3 w-3" />}
                    <span>
                      {v.approval_kind === 'manual' ? 'Cierre manual' : 'Aprobada por'}
                      {v.approved_by_name ? ` ${v.approval_kind === 'manual' ? '·' : ''} ${v.approved_by_name}` : ''}
                      {' · '}{fmtDateTime(v.approved_at)}
                    </span>
                  </div>
                )}
              </div>

              <Button size="sm" variant="outline" className="shrink-0 gap-1.5" onClick={() => setSelected(v)}>
                <Eye className="h-3.5 w-3.5" /> Ver snapshot
              </Button>
            </li>
          ))}
        </ol>
      </div>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          {selected && <SnapshotView version={selected} />}
        </SheetContent>
      </Sheet>
    </>
  );
}

function SnapshotView({ version }: { version: ReportVersionHistoryEntry }) {
  const payload = version.normalized_payload ?? {};
  const property = payload.property ?? {};
  const sections: any[] = Array.isArray(payload.sections) ? payload.sections : [];

  const totals = useMemo(() => {
    let repairs = 0;
    let total = 0;
    let ownerTotal = 0;
    let tenantTotal = 0;
    for (const s of sections) {
      for (const r of s.repairs ?? []) {
        const amount = Number(r.subtotal ?? (Number(r.quantity || 0) * Number(r.unit_price || 0)));
        repairs += 1;
        total += amount;
        if (r.payer_role === 'tenant') tenantTotal += amount;
        else ownerTotal += amount;
      }
    }
    return { repairs, total, ownerTotal, tenantTotal };
  }, [sections]);

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          <FileText className="h-4 w-4" /> Cotización v{version.version_number}
          {version.is_latest && <Badge variant="secondary" className="text-[10px]">Vigente</Badge>}
        </SheetTitle>
        <SheetDescription>
          Publicada el {fmtDateTime(version.created_at)}
          {version.published_by_name ? ` por ${version.published_by_name}` : ''}.
          {' '}Vista interna del snapshot exacto enviado al propietario.
        </SheetDescription>
      </SheetHeader>

      <div className="mt-6 space-y-5">
        <div className="rounded-md border bg-muted/20 px-3 py-2.5 text-xs space-y-0.5">
          <p className="font-medium text-foreground">{property.property_name || property.property_id || 'Propiedad'}</p>
          {property.address && <p className="text-muted-foreground">{property.address}</p>}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Stat label="Reparaciones" value={String(totals.repairs)} />
          <Stat label="Total propietario" value={fmtMoney(totals.ownerTotal)} />
          <Stat label="Total inquilino" value={fmtMoney(totals.tenantTotal)} />
        </div>

        <div className="space-y-3">
          {sections.map((s) => {
            const repairs = (s.repairs ?? []) as any[];
            if (repairs.length === 0) return null;
            const subtotal = repairs.reduce((acc, r) => acc + Number(r.subtotal ?? (Number(r.quantity || 0) * Number(r.unit_price || 0))), 0);
            return (
              <div key={s.id} className="rounded-md border">
                <div className="px-3 py-2 border-b flex items-center justify-between bg-muted/30">
                  <p className="text-sm font-medium">{s.title}</p>
                  <span className="text-xs font-mono tabular-nums text-muted-foreground">{fmtMoney(subtotal)}</span>
                </div>
                <ul className="divide-y divide-border/60">
                  {repairs.map((r: any, i: number) => (
                    <li key={r.id ?? i} className="px-3 py-2 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm leading-snug">{r.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {Number(r.quantity || 0)} {r.unit ?? ''} · {fmtMoney(Number(r.unit_price || 0))}
                          {r.payer_role === 'tenant' ? ' · Inquilino' : ' · Propietario'}
                          {r.payment_nature === 'optional' ? ' · Opcional' : ''}
                        </p>
                      </div>
                      <span className="text-sm font-mono tabular-nums shrink-0">
                        {fmtMoney(Number(r.subtotal ?? (Number(r.quantity || 0) * Number(r.unit_price || 0))))}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between rounded-md border bg-primary/5 px-3 py-2.5">
          <span className="text-sm font-medium">Total cotización</span>
          <span className="text-base font-mono tabular-nums font-semibold">{fmtMoney(totals.total)}</span>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-card px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold mt-0.5 font-mono tabular-nums">{value}</p>
    </div>
  );
}
