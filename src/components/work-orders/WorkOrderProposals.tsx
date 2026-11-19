import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Lightbulb, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import SignedPhotoImg from '@/components/SignedPhotoImg';
import { MoneyDisplay } from '@/shared/ui/MoneyDisplay';
import { createProposal, decideProposal, fetchProposals, type WorkOrderProposal } from '@/modules/work-orders/api/proposals.service';

const STATUS: Record<string, string> = { pending: 'Pendiente', approved: 'Aprobada · va al inversionista', rejected: 'Rechazada' };

interface Props {
  workOrderId: string;
  inspectionId: string;
  market: string;
  /** contractor: puede proponer. staff: decide. */
  mode: 'contractor' | 'staff';
  canPropose?: boolean;
  onChanged?: () => void;
}

/** Trabajos extra propuestos por el contratista con foto, comentario y costo; la ejecutiva aprueba con precio al inversionista. */
export default function WorkOrderProposals({ workOrderId, inspectionId, market, mode, canPropose, onChanged }: Props) {
  const [rows, setRows] = useState<WorkOrderProposal[]>([]);
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [cost, setCost] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(() => fetchProposals(workOrderId).then(setRows).catch(() => setRows([])), [workOrderId]);
  useEffect(() => { void load(); }, [load]);

  const submit = async () => {
    const n = Number(cost);
    if (!title.trim()) { toast.error('Indicá qué trabajo proponés'); return; }
    if (!Number.isFinite(n) || n < 0) { toast.error('Indicá un costo válido'); return; }
    if (!photo) { toast.error('Agregá una foto'); return; }
    setBusy(true);
    try {
      await createProposal({ workOrderId, inspectionId, title, comment, cost: n, photo });
      toast.success('Propuesta enviada a Homie');
      setTitle(''); setComment(''); setCost(''); setPhoto(null);
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo enviar'); } finally { setBusy(false); }
  };

  const decide = async (p: WorkOrderProposal, approve: boolean) => {
    const price = prices[p.id] !== undefined ? Number(prices[p.id]) : null;
    if (approve && (price === null || !Number.isFinite(price) || price < 0)) { toast.error('Indicá el precio para el inversionista'); return; }
    if (!approve && !notes[p.id]?.trim()) { toast.error('Indicá el motivo del rechazo'); return; }
    setBusy(true);
    try {
      await decideProposal(p.id, approve, approve ? price : null, notes[p.id]?.trim() || null);
      toast.success(approve ? 'Propuesta aprobada: agregala en la próxima versión de la cotización' : 'Propuesta rechazada');
      await load(); onChanged?.();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo registrar'); } finally { setBusy(false); }
  };

  if (mode === 'staff' && rows.length === 0) return null;

  return (
    <div className="space-y-3 border-t pt-3">
      <p className="text-sm font-medium flex items-center gap-2"><Lightbulb className="h-4 w-4" /> Propuestas del contratista</p>
      {rows.map((p) => (
        <div key={p.id} className="rounded-lg border p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium">{p.title}</p>
            <Badge variant="outline">{STATUS[p.status]}</Badge>
          </div>
          {p.comment && <p className="text-xs text-muted-foreground whitespace-pre-line">{p.comment}</p>}
          <p className="text-xs text-muted-foreground">Costo propuesto: <MoneyDisplay value={p.proposed_cost} market={market} /></p>
          {p.photo_path && (
            <SignedPhotoImg url="" storagePath={p.photo_path} alt={`Foto de ${p.title}`} loading="lazy"
              className="h-24 w-24 rounded-md object-cover bg-muted" />
          )}
          {p.decision_note && <p className="text-xs">Nota de Homie: {p.decision_note}</p>}
          {mode === 'staff' && p.status === 'pending' && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">Precio al inversionista</Label>
                  <Input type="number" min={0} value={prices[p.id] ?? ''} onChange={(e) => setPrices((s) => ({ ...s, [p.id]: e.target.value }))} /></div>
                <div><Label className="text-xs">Nota (obligatoria al rechazar)</Label>
                  <Input value={notes[p.id] ?? ''} onChange={(e) => setNotes((s) => ({ ...s, [p.id]: e.target.value }))} /></div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => decide(p, true)} disabled={busy}>Aprobar</Button>
                <Button size="sm" variant="outline" onClick={() => decide(p, false)} disabled={busy}>Rechazar</Button>
              </div>
            </div>
          )}
        </div>
      ))}
      {mode === 'contractor' && canPropose && (
        <div className="rounded-lg border p-3 space-y-2">
          <p className="text-xs text-muted-foreground">¿Encontraste un trabajo extra? Proponelo con foto y costo; Homie lo revisa con el inversionista antes de que lo hagas.</p>
          <Input placeholder="Trabajo propuesto" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          <Textarea placeholder="Comentario" value={comment} onChange={(e) => setComment(e.target.value)} rows={2} maxLength={2000} />
          <Input type="number" min={0} placeholder="Costo" value={cost} onChange={(e) => setCost(e.target.value)} />
          <Input type="file" accept="image/*" capture="environment" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
          <Button onClick={submit} disabled={busy} className="w-full">
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Enviar propuesta
          </Button>
        </div>
      )}
    </div>
  );
}
