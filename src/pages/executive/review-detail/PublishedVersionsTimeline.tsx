import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye, Download, Loader2, History, GitCompareArrows } from 'lucide-react';
import { useReportVersionsHistory, type ReportVersionHistoryEntry } from '@/modules/review/api/useReportVersionsHistory';
import { compareQuotations, snapshotRepairs, snapshotTotals, historicalAmount, decisionLabel } from '@/lib/quotation-history';
import { downloadQuotationHistory } from '@/lib/quotation-history-download';
import { useToast } from '@/hooks/use-toast';

const date = (iso: string) => new Date(iso).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' });
const fieldLabels: Record<string, string> = { name: 'Nombre', description: 'Descripción', quantity: 'Cantidad', unit: 'Unidad', unit_price: 'Precio', payer_role: 'Responsable de pago', payment_nature: 'Tipo', is_pending_quote: 'Precio pendiente', section: 'Sección' };
const valueLabel = (key: string, value: unknown): string => {
  if (key === 'payer_role') return value === 'tenant' ? 'Inquilino' : 'Propietario';
  if (key === 'payment_nature') return value === 'optional' ? 'Opcional' : 'Recomendada';
  if (key === 'is_pending_quote') return value ? 'Por cotizar' : 'Cotizada';
  return value == null ? '—' : String(value);
};

export function PublishedVersionsTimeline({ inspectionId }: { inspectionId: string }) {
  const { data, isLoading, error, refetch } = useReportVersionsHistory(inspectionId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [compare, setCompare] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const { toast } = useToast();
  const versions = data ?? [];
  const selectedIndex = versions.findIndex(v => v.id === selectedId);
  const selected = versions[selectedIndex];
  const previous = versions[selectedIndex + 1];
  const download = async (v: ReportVersionHistoryEntry) => {
    setDownloading(v.id);
    try { await downloadQuotationHistory(v); }
    catch { toast({ title: 'No se pudo descargar la cotización', variant: 'destructive' }); }
    finally { setDownloading(null); }
  };
  if (isLoading) return <p className="flex items-center gap-2 text-sm text-muted-foreground py-4"><Loader2 className="h-4 w-4 animate-spin" /> Cargando historial…</p>;
  if (error) return <div className="py-4 text-sm"><p>No se pudo cargar el historial.</p><Button variant="outline" size="sm" onClick={() => refetch()}>Reintentar</Button></div>;
  return (
    <section className="border-t border-border pt-4">
      <h3 className="text-base font-semibold flex items-center gap-2"><History className="h-4 w-4" /> Historial de cotizaciones</h3>
      {versions.length === 0 ? <p className="text-sm text-muted-foreground py-4">Todavía no hay cotizaciones publicadas.</p> : (
        <ol className="divide-y divide-border mt-2">
          {versions.map((v, index) => (
            <li key={v.id} className="py-3 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-40">
                <div className="flex items-center gap-2"><span className="text-sm font-semibold">v{v.version_number}</span>{v.is_latest && <Badge variant="secondary">Vigente</Badge>}</div>
                <p className="text-xs text-muted-foreground mt-1">{date(v.created_at)} · {v.published_by_name ?? 'Responsable no registrado'}</p>
                <p className="text-xs mt-1">{v.approval_kind === 'manual' ? `Cierre manual · ${v.approved_by_name ?? ''}` : v.approved_at ? `Aprobada · ${v.approved_by_name ?? ''}` : v.decisions.length ? `${v.decisions.filter(d => d.decision === 'rejected').length} rechazadas · ${v.decisions.filter(d => d.decision === 'observed').length} con observaciones` : 'Sin respuesta del inversionista'}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => { setSelectedId(v.id); setCompare(false); }}><Eye className="h-3.5 w-3.5 mr-1.5" /> Ver versión</Button>
                {index < versions.length - 1 && <Button size="sm" variant="outline" onClick={() => { setSelectedId(v.id); setCompare(true); }}><GitCompareArrows className="h-3.5 w-3.5 mr-1.5" /> Ver cambios</Button>}
                <Button size="sm" variant="outline" disabled={downloading === v.id} onClick={() => download(v)}>{downloading === v.id ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1.5" />} PDF</Button>
              </div>
            </li>
          ))}
        </ol>
      )}
      <Sheet open={!!selected} onOpenChange={o => { if (!o) setSelectedId(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto">
          {selected && <>
            <SheetHeader>
              <SheetTitle>{compare && previous ? `Cambios de v${previous.version_number} a v${selected.version_number}` : `Cotización v${selected.version_number}`}</SheetTitle>
              <SheetDescription>{date(selected.created_at)} · {selected.published_by_name ?? 'Responsable no registrado'}</SheetDescription>
            </SheetHeader>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button size="sm" variant={!compare ? 'secondary' : 'outline'} onClick={() => setCompare(false)}>Cotización</Button>
              {previous && <Button size="sm" variant={compare ? 'secondary' : 'outline'} onClick={() => setCompare(true)}>Cambios</Button>}
              <Button size="sm" variant="outline" disabled={downloading === selected.id} onClick={() => download(selected)}><Download className="h-4 w-4 mr-1.5" /> Descargar PDF</Button>
            </div>
            {compare && previous ? <Changes before={previous} after={selected} /> : <Snapshot version={selected} />}
          </>}
        </SheetContent>
      </Sheet>
    </section>
  );
}

function moneyFor(v: ReportVersionHistoryEntry) {
  const currency = v.normalized_payload.tax_config?.currency ?? (v.normalized_payload.property?.market === 'MX' ? 'MXN' : 'CLP');
  return (n: number) => `${currency} ${Number(n).toLocaleString('es-CL', { maximumFractionDigits: 2 })}`;
}

function Snapshot({ version }: { version: ReportVersionHistoryEntry }) {
  const p = version.normalized_payload ?? {};
  const totals = snapshotTotals(p);
  const money = moneyFor(version);
  const decisions = new Map(version.decisions.map(d => [d.repair_item_id, d]));
  return <div className="mt-5 space-y-5">
    <div><h4 className="font-semibold">{p.property?.property_name ?? p.property?.property_id}</h4><p className="text-sm text-muted-foreground">{p.property?.address}</p></div>
    <div className="space-y-3">
      {snapshotRepairs(p).map(r => {
        const d = r.id ? decisions.get(r.id) : undefined;
        return <article key={r.key} className="border-b border-border pb-3">
          <div className="flex justify-between gap-3"><div className="min-w-0"><p className="text-xs text-muted-foreground">{r.section}</p><h5 className="text-sm font-semibold break-words">{r.name}</h5></div><span className="text-sm shrink-0">{r.is_pending_quote ? 'Por cotizar' : money(historicalAmount(r))}</span></div>
          {r.description && <p className="text-sm mt-1">{r.description}</p>}
          <p className="text-xs text-muted-foreground mt-1">{r.quantity} {r.unit} · {r.is_pending_quote ? 'Por cotizar' : money(Number(r.unit_price ?? 0))} · {r.payer_role === 'tenant' ? 'Inquilino' : 'Propietario'} · {r.payment_nature === 'optional' ? 'Opcional' : 'Recomendada'}</p>
          <Badge variant={d?.decision === 'rejected' ? 'destructive' : 'outline'} className="mt-2">{r.is_pending_quote ? 'Pendiente de precio' : decisionLabel(d?.decision)}</Badge>
          {d?.comment && <p className="text-sm mt-2 break-words">{d.comment}</p>}
          {d && <p className="text-xs text-muted-foreground mt-1">{d.submitter_name ?? 'Inversionista'}{d.submitted_at ? ` · ${date(d.submitted_at)}` : ''}</p>}
        </article>;
      })}
    </div>
    <dl className="space-y-2 text-sm">
      {[['Subtotal propietario', totals.owner], ['Subtotal inquilino', totals.tenant], ['Descuento', -totals.discount], [p.tax_config?.label ?? 'Impuesto', totals.tax], ['Total cotización', totals.total]].map(([label, amount]) => <div key={String(label)} className="flex justify-between gap-3"><dt>{label}</dt><dd className="font-mono">{money(Number(amount))}</dd></div>)}
    </dl>
    {p.discount?.reason && <p className="text-sm text-muted-foreground">Descuento: {p.discount.reason}</p>}
  </div>;
}

function Changes({ before, after }: { before: ReportVersionHistoryEntry; after: ReportVersionHistoryEntry }) {
  const diff = compareQuotations(before.normalized_payload, after.normalized_payload);
  const money = moneyFor(after);
  return <div className="mt-5 space-y-4">
    <div className="flex flex-wrap justify-between gap-3 border-b pb-3 text-sm"><span>v{before.version_number}: {money(diff.totalBefore)}</span><span>v{after.version_number}: {money(diff.totalAfter)}</span><strong>Diferencia: {money(diff.totalAfter - diff.totalBefore)}</strong></div>
    {diff.legacy && <p className="text-sm text-muted-foreground">Esta versión antigua contiene partidas sin identificador; se muestran por separado.</p>}
    {diff.changes.length === 0 && !diff.discountChanged && !diff.taxChanged && <p className="text-sm text-muted-foreground">Sin cambios en las partidas ni en los montos.</p>}
    {diff.changes.map((c, i) => <article key={i} className="border-b pb-3"><div className="flex gap-2 items-center"><Badge variant="outline">{c.kind === 'added' ? 'Agregada' : c.kind === 'removed' ? 'Retirada' : 'Modificada'}</Badge><h5 className="text-sm font-medium break-words">{c.name}</h5></div>{c.fields.map(f => <p key={f} className="text-sm mt-2 break-words"><span className="text-muted-foreground">{fieldLabels[f]}: </span>{valueLabel(f, c.before?.[f as keyof NonNullable<typeof c.before>])} → {valueLabel(f, c.after?.[f as keyof NonNullable<typeof c.after>])}</p>)}{c.kind !== 'changed' && <p className="text-sm mt-2">{(c.after ?? c.before)?.is_pending_quote ? 'Por cotizar' : money(historicalAmount(c.after ?? c.before ?? {}))}</p>}</article>)}
    {diff.discountChanged && <p className="text-sm">Descuento: {money(snapshotTotals(before.normalized_payload).discount)} → {money(snapshotTotals(after.normalized_payload).discount)}{after.normalized_payload.discount?.reason ? ` · ${after.normalized_payload.discount.reason}` : ''}</p>}
    {diff.taxChanged && <p className="text-sm">Impuesto: {before.normalized_payload.tax_config?.percentage ?? 0}% → {after.normalized_payload.tax_config?.percentage ?? 0}%</p>}
  </div>;
}
