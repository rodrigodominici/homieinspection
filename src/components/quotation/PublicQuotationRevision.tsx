import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { revisionAmount, revisionError, type RevisionValues } from '@/lib/quotation-revision';
import type { Json } from '@/integrations/supabase/types';

interface PublicRevision {
  status: string; reason: string; submitter_name: string | null;
  changes: { id: string; kind: string; before: RevisionValues | null; after: RevisionValues | null; decision: string | null; comment: string | null }[];
}
export default function PublicQuotationRevision({ propertyId, token, onChanged }: { propertyId: string; token: string; onChanged: () => void }) {
  const [revision, setRevision] = useState<PublicRevision | null>(null);
  const [decisions, setDecisions] = useState<Record<string, string>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { let current = true; void supabase.rpc('get_quotation_revision_public', { p_property_id: propertyId, p_token: token }).then(({ data, error: err }) => {
    if (current) { if (err) setError('No se pudieron cargar los cambios de cotización. Recargá la página.'); else setRevision(data as unknown as PublicRevision | null); }
  }); return () => { current = false; }; }, [propertyId, token]);
  if (!revision) return error ? <p role="alert" className="text-destructive text-sm">{error}</p> : null;
  const pending = revision.status === 'awaiting_approval';
  const submit = async () => {
    setBusy(true); setError('');
    const { error: err } = await supabase.rpc('submit_quotation_revision_decisions', {
      p_property_id: propertyId, p_token: token, p_submitter_name: name,
      p_decisions: revision.changes.map(c => ({ id: c.id, decision: decisions[c.id], comment: comments[c.id] ?? '' })) as Json,
    });
    if (err) setError(revisionError(err));
    else { setRevision({ ...revision, status: 'resolved', submitter_name: name, changes: revision.changes.map(c => ({ ...c, decision: decisions[c.id], comment: comments[c.id] ?? '' })) }); onChanged(); }
    setBusy(false);
  };
  return <section className="border-t border-b py-6 space-y-4" aria-label="Cambios de cotización">
    <div><h2 className="text-lg font-semibold">Cambios de cotización</h2><p className="text-sm text-muted-foreground mt-1">{revision.reason}</p></div>
    {revision.changes.map(c => <article key={c.id} className="border-b pb-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{c.kind === 'remove' ? 'Retiro solicitado' : c.kind === 'add' ? 'Nueva partida' : 'Modificación'}</Badge><h3 className="text-sm font-semibold">{(c.after ?? c.before)?.title_snapshot}</h3></div>
      <div className="grid sm:grid-cols-2 gap-3 text-sm">
        {c.before && <div><p className="text-muted-foreground">Anterior</p><p>{c.before.quantity} {c.before.unit} × {c.before.unit_price.toLocaleString('es-CL')} = {revisionAmount(c.before).toLocaleString('es-CL')}</p><p>{c.before.payer_role === 'tenant' ? 'Arrendatario' : 'Propietario'}</p>{c.before.description_snapshot && <p>{c.before.description_snapshot}</p>}</div>}
        {c.after && <div><p className="text-muted-foreground">Propuesto</p><p>{c.after.quantity} {c.after.unit} × {c.after.unit_price.toLocaleString('es-CL')} = {revisionAmount(c.after).toLocaleString('es-CL')}</p><p>{c.after.payer_role === 'tenant' ? 'Arrendatario' : 'Propietario'}</p>{c.after.description_snapshot && <p>{c.after.description_snapshot}</p>}</div>}
      </div>
      {pending ? <>
        <ToggleGroup type="single" value={decisions[c.id] ?? ''} onValueChange={v => { if (v) setDecisions(prev => ({ ...prev, [c.id]: v })); }} aria-label={`Decisión sobre ${ (c.after ?? c.before)?.title_snapshot}`} className="justify-start"><ToggleGroupItem value="accepted">Aprobar cambio</ToggleGroupItem><ToggleGroupItem value="rejected">Rechazar cambio</ToggleGroupItem></ToggleGroup>
        <Label htmlFor={`change-comment-${c.id}`}>Comentario (opcional)</Label><Textarea id={`change-comment-${c.id}`} value={comments[c.id] ?? ''} onChange={e => setComments(prev => ({ ...prev, [c.id]: e.target.value }))} maxLength={2000} />
      </> : <p className="text-sm">{c.decision === 'accepted' ? 'Cambio aprobado y aplicado a la OT' : 'Cambio rechazado; se conserva la partida anterior'}{c.comment ? ` · ${c.comment}` : ''}</p>}
    </article>)}
    {pending ? <><Label htmlFor="revision-submitter">Nombre de quien responde</Label><Input id="revision-submitter" value={name} onChange={e => setName(e.target.value)} /><Button disabled={busy || name.trim().length < 2 || revision.changes.some(c => !decisions[c.id])} onClick={() => void submit()}>{busy ? 'Enviando…' : 'Confirmar decisiones de cambios'}</Button></> : <p className="text-sm text-muted-foreground">Respuesta registrada: {revision.submitter_name}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>;
}