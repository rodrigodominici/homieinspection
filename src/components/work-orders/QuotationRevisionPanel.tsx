import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2, Send, Download, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { downloadQuotationHistory } from '@/lib/quotation-history-download';
import { canReviseWork, revisionDifference, revisionError, type QuotationRevision, type RevisionValues } from '@/lib/quotation-revision';
import type { WorkOrderDetail } from '@/modules/work-orders/api/work-orders.service';
import { discardQuotationRevision, fetchQuotationRevisions, saveQuotationChange, startQuotationRevision, submitQuotationRevision } from '@/modules/work-orders/api/quotation-revisions.service';

export default function QuotationRevisionPanel({ inspectionId, detail, market, onChanged }: { inspectionId: string; detail: WorkOrderDetail; market: string; onChanged: () => void }) {
  const qc = useQueryClient();
  const [revisions, setRevisions] = useState<QuotationRevision[]>([]);
  const [repairs, setRepairs] = useState<RevisionValues[]>([]);
  const [sections, setSections] = useState<{ id: string; section_title: string }[]>([]);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<{ id: string | null; kind: 'add' | 'modify'; values: RevisionValues } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [ownerUrl, setOwnerUrl] = useState('');
  const [loadError, setLoadError] = useState(false);
  const load = useCallback(async () => {
    try {
      const [rows, rp, sec, ver] = await Promise.all([
        fetchQuotationRevisions(inspectionId),
        supabase.from('inspection_repair_items').select('*').eq('inspection_id', inspectionId).eq('is_archived', false).order('sort_order'),
        supabase.from('inspection_sections').select('id,section_title').eq('inspection_id', inspectionId).order('sort_order'),
        supabase.from('inspection_report_versions').select('public_token').eq('inspection_id', inspectionId).eq('audience', 'owner').eq('is_latest', true).maybeSingle(),
      ]);
      if (rp.error || sec.error || ver.error) throw rp.error ?? sec.error ?? ver.error;
      setRevisions(rows); setRepairs((rp.data ?? []) as RevisionValues[]); setSections(sec.data ?? []);
      setReason(rows.find(r => r.status === 'draft')?.reason ?? '');
      if (ver.data?.public_token && detail.inspection?.property_id) setOwnerUrl(`${window.location.origin}/reportes/${encodeURIComponent(detail.inspection.property_id)}/${ver.data.public_token}`);
      setLoadError(false);
    } catch { setLoadError(true); }
  }, [inspectionId, detail.inspection?.property_id]);
  useEffect(() => { void load(); }, [load]);
  const active = revisions.find(r => r.status === 'draft' || r.status === 'awaiting_approval');
  const writable = active?.status === 'draft';
  const allowed = ['open', 'in_progress', 'rejected', 'contractor_rejected'].includes(detail.order.status);
  const money = (n: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: market === 'MX' ? 'MXN' : 'CLP', maximumFractionDigits: 2 }).format(n);
  const mutate = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); await load(); await qc.invalidateQueries({ queryKey: ['report-versions', inspectionId] }); onChanged(); }
    catch (error) { toast.error(revisionError(error)); }
    finally { setBusy(false); }
  };
  const locked = (id?: string) => detail.items.some(i => i.repair_item_id === id && !canReviseWork(i.status, i.is_archived));
  const save = async () => {
    if (!active || !form) return;
    await mutate(async () => { await saveQuotationChange(active.id, form.id, form.kind, form.values, reason); setForm(null); });
  };
  const patchForm = (patch: Partial<RevisionValues>) => setForm(prev => prev ? { ...prev, values: { ...prev.values, ...patch } } : null);
  const exportRevision = async (r: QuotationRevision) => {
    const payload = { property: { property_name: detail.inspection?.property_name ?? undefined, market }, sections: [{ title: `Cambios — ${r.reason}`, repairs: r.changes.map(c => {
      const v = c.after_json ?? c.before_json;
      return { id: c.repair_item_id, name: `${c.kind === 'remove' ? 'Retirar: ' : c.kind === 'add' ? 'Agregar: ' : 'Modificar: '}${v?.title_snapshot}`, quantity: v?.quantity, unit: v?.unit, unit_price: v?.unit_price, payer_role: v?.payer_role };
    }) }] };
    await downloadQuotationHistory({ version_number: 0, created_at: r.submitted_at ?? r.created_at, published_by_name: null, normalized_payload: payload, decisions: r.changes.filter(c => c.decision).map(c => ({ repair_item_id: c.repair_item_id, decision: c.decision ?? '', comment: c.comment, submitter_name: r.submitter_name })) });
  };
  return <section className="space-y-3 border-t pt-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Cambios de cotización con OT</h3><Button size="icon" variant="ghost" aria-label="Actualizar revisiones" title="Actualizar revisiones" onClick={() => void load()}><RefreshCw className="h-4 w-4" /></Button></div>
    {loadError ? <p role="alert" className="text-sm text-destructive">No se pudieron cargar las revisiones.</p> : <>
      {!active && allowed && <Button variant="outline" disabled={busy} onClick={() => void mutate(() => startQuotationRevision(inspectionId))}><Pencil className="h-4 w-4 mr-2" />Modificar cotización</Button>}
      {active && <>
        <Badge variant="outline">{writable ? 'Borrador de cambios' : 'Esperando aprobación del inversionista'}</Badge>
        {writable ? <><Label htmlFor={`revision-reason-${inspectionId}`}>Motivo de la modificación</Label><Textarea id={`revision-reason-${inspectionId}`} value={reason} onChange={e => setReason(e.target.value)} />
          <div className="divide-y">
            {repairs.map(r => <div key={r.id} className="flex flex-wrap justify-between items-center gap-2 py-2"><span className="text-sm break-words">{r.title_snapshot}</span><div className="flex items-center gap-1">
              {locked(r.id) ? <Badge variant="secondary">Terminada · sin cambios</Badge> : <>
                <Button variant="ghost" size="icon" disabled={busy} title={`Modificar ${r.title_snapshot}`} aria-label={`Modificar ${r.title_snapshot}`} onClick={() => setForm({ id: r.id ?? null, kind: 'modify', values: active.changes.find(c => c.repair_item_id === r.id)?.after_json ?? r })}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" disabled={busy} title={`Proponer retiro de ${r.title_snapshot}`} aria-label={`Proponer retiro de ${r.title_snapshot}`} onClick={() => void mutate(() => saveQuotationChange(active.id, r.id ?? null, 'remove', null, reason))}><Trash2 className="h-4 w-4" /></Button>
              </>}
            </div></div>)}
          </div>
          <Button variant="outline" disabled={busy} onClick={() => setForm({ id: null, kind: 'add', values: { title_snapshot: '', description_snapshot: '', inspection_section_id: sections[0]?.id, quantity: 1, unit: 'serv', unit_price: 0, contractor_unit_price: 0, payer_role: 'owner', payment_nature: 'required' } })}><Plus className="h-4 w-4 mr-2" />Agregar partida</Button>
        </> : <p className="text-sm text-muted-foreground">{active.reason}</p>}
        {active.changes.map(c => <article key={c.id} className="border-b py-2 text-sm space-y-1"><div className="flex items-center gap-2"><Badge variant="outline">{c.kind === 'add' ? 'Agregar' : c.kind === 'remove' ? 'Retirar' : 'Modificar'}</Badge><span className="break-words">{(c.after_json ?? c.before_json)?.title_snapshot}</span>{writable && <Button size="icon" variant="ghost" aria-label="Descartar cambio" title="Descartar cambio" onClick={() => void mutate(() => discardQuotationRevision(active.id, c.id))}><Trash2 className="h-4 w-4" /></Button>}</div><p className="text-xs text-muted-foreground">Diferencia de subtotal: {money(revisionDifference(c))}</p></article>)}
        {writable ? <div className="flex flex-wrap gap-2"><Button disabled={busy || active.changes.length === 0 || reason.trim().length < 3} onClick={() => setConfirming(true)}><Send className="h-4 w-4 mr-2" />Enviar cambios al inversionista</Button><Button variant="outline" disabled={busy} onClick={() => void mutate(() => discardQuotationRevision(active.id))}>Descartar borrador</Button></div> : ownerUrl && <Button variant="outline" onClick={() => void navigator.clipboard.writeText(ownerUrl).then(() => toast.success('Enlace copiado'))}>Copiar enlace para aprobación</Button>}
      </>}
      {revisions.filter(r => r.status === 'resolved').map(r => <article key={r.id} className="border-b py-3 space-y-2"><div className="flex items-center justify-between gap-2"><p className="text-sm font-medium">{r.reason}</p><Button size="icon" variant="ghost" title="Descargar revisión" aria-label="Descargar revisión" onClick={() => void exportRevision(r)}><Download className="h-4 w-4" /></Button></div><p className="text-xs text-muted-foreground">{r.submitter_name} · {new Date(r.submitted_at ?? r.created_at).toLocaleString('es-CL')}</p>{r.changes.map(c => <p key={c.id} className="text-xs">{(c.after_json ?? c.before_json)?.title_snapshot} · {c.decision === 'accepted' ? 'Cambio aplicado' : 'Cambio rechazado; se conserva lo anterior'}{c.comment ? ` · ${c.comment}` : ''}</p>)}</article>)}
    </>}
    <Dialog open={!!form} onOpenChange={o => { if (!o) setForm(null); }}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{form?.kind === 'add' ? 'Nueva partida' : 'Modificar partida'}</DialogTitle></DialogHeader>{form && <div className="space-y-3">
      <Label htmlFor="revision-title">Descripción del trabajo</Label><Input id="revision-title" value={form.values.title_snapshot} onChange={e => patchForm({ title_snapshot: e.target.value })} />
      <Label htmlFor="revision-description">Detalle</Label><Textarea id="revision-description" value={form.values.description_snapshot ?? ''} onChange={e => patchForm({ description_snapshot: e.target.value })} />
      <Label htmlFor="revision-section">Sección</Label><Select value={form.values.inspection_section_id} onValueChange={v => patchForm({ inspection_section_id: v })}><SelectTrigger id="revision-section"><SelectValue /></SelectTrigger><SelectContent>{sections.map(s => <SelectItem key={s.id} value={s.id}>{s.section_title}</SelectItem>)}</SelectContent></Select>
      <div className="grid grid-cols-2 gap-3"><div><Label htmlFor="revision-quantity">Cantidad</Label><Input id="revision-quantity" type="number" min="0.01" step="any" value={form.values.quantity} onChange={e => patchForm({ quantity: Number(e.target.value) })} /></div><div><Label htmlFor="revision-unit">Unidad</Label><Input id="revision-unit" value={form.values.unit} onChange={e => patchForm({ unit: e.target.value })} /></div></div>
      <Label htmlFor="revision-price">Precio cliente</Label><Input id="revision-price" type="number" min="0" step="any" value={form.values.unit_price} onChange={e => patchForm({ unit_price: Number(e.target.value) })} />
      <Label htmlFor="revision-cost">Costo contratista</Label><Input id="revision-cost" type="number" min="0" step="any" value={form.values.contractor_unit_price ?? 0} onChange={e => patchForm({ contractor_unit_price: Number(e.target.value) })} />
      <Label htmlFor="revision-payer">A cargo de</Label><Select value={form.values.payer_role} onValueChange={v => { if (v === 'owner' || v === 'tenant') patchForm({ payer_role: v }); }}><SelectTrigger id="revision-payer"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="owner">Propietario</SelectItem><SelectItem value="tenant">Arrendatario</SelectItem></SelectContent></Select>
      <Label htmlFor="revision-nature">Tipo de partida</Label><Select value={form.values.payment_nature ?? 'required'} onValueChange={v => { if (v === 'required' || v === 'optional') patchForm({ payment_nature: v }); }}><SelectTrigger id="revision-nature"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="required">Recomendada</SelectItem><SelectItem value="optional">Opcional</SelectItem></SelectContent></Select>
      <Button disabled={busy || !form.values.title_snapshot.trim() || form.values.quantity <= 0} onClick={() => void save()}>Guardar cambio</Button>
    </div>}</DialogContent></Dialog>
    <Dialog open={confirming} onOpenChange={setConfirming}><DialogContent><DialogHeader><DialogTitle>Enviar revisión de cotización</DialogTitle></DialogHeader><p className="text-sm">Los cambios requieren nueva aprobación. Las partidas afectadas quedarán pausadas; los trabajos sin cambios pueden continuar.</p><DialogFooter><Button variant="outline" onClick={() => setConfirming(false)}>Cancelar</Button><Button disabled={busy} onClick={() => { if (active) void mutate(async () => { await submitQuotationRevision(active.id, reason); setConfirming(false); toast.success('Revisión enviada. Compartí el enlace con el inversionista.'); }); }}>Confirmar envío</Button></DialogFooter></DialogContent></Dialog>
  </section>;
}