import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Hammer, Loader2, Check, Undo2, Camera } from 'lucide-react';
import { toast } from 'sonner';
import SignedPhotoImg from '@/components/SignedPhotoImg';
import { supabase } from '@/integrations/supabase/client';
import {
  assignWorkOrder,
  fetchWorkOrderByInspection,
  reviewWorkOrder,
  type WorkOrderDetail,
} from '@/modules/work-orders/api/work-orders.service';
import {
  workOrderItemStatusLabel,
  workOrderItemToneClass,
  workOrderStatusLabel,
  workOrderStatusToneClass,
  workStatusLabel,
} from '@/lib/work-order-status';

interface Props {
  inspectionId: string;
  /** `homie`, `dueno` o `ninguno`. El panel solo aplica cuando repara Homie. */
  quienRepara: string | null | undefined;
  inspectionStatus: string;
  market: string;
  /** Etapa de obra guardada en la inspección. */
  workStatus?: string | null;
  onChanged?: () => void;
}

interface ContractorOption { id: string; name: string; country: string }

/** Panel de obra para Admin y Ejecutivo: asignación, avance y revisión. */
export default function WorkOrderPanel({
  inspectionId,
  quienRepara,
  inspectionStatus,
  market,
  workStatus,
  onChanged,
}: Props) {
  const [detail, setDetail] = useState<WorkOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [contractors, setContractors] = useState<ContractorOption[]>([]);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    try {
      setDetail(await fetchWorkOrderByInspection(inspectionId));
    } catch {
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [inspectionId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('contractors')
      .select('id,name,country')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => {
        if (cancelled) return;
        const rows = (data ?? []) as ContractorOption[];
        setContractors(rows.filter((c) => !market || !c.country || c.country === market));
      });
    return () => { cancelled = true; };
  }, [market]);

  if (quienRepara !== 'homie') return null;

  const eligible = ['approved', 'published', 'accepted', 'sent'].includes(inspectionStatus);
  if (!eligible && !detail) return null;

  const handleAssign = async () => {
    if (!selected) { toast.error('Selecciona una empresa contratista'); return; }
    setBusy(true);
    try {
      await assignWorkOrder(inspectionId, selected);
      toast.success('Orden de trabajo asignada');
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo asignar la orden');
    } finally {
      setBusy(false);
    }
  };

  const handleReview = async (approve: boolean) => {
    if (!detail) return;
    if (!approve && !note.trim()) { toast.error('Indica qué debe corregir el contratista'); return; }
    setBusy(true);
    try {
      await reviewWorkOrder(detail.order.id, approve, note.trim() || null);
      toast.success(approve ? 'Obra aprobada' : 'Orden devuelta al contratista');
      setNote('');
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo registrar la revisión');
    } finally {
      setBusy(false);
    }
  };

  const items = detail?.items ?? [];
  const resolved = items.filter((i) => i.status === 'done' || i.status === 'not_done');
  const pct = items.length > 0 ? Math.round((resolved.length / items.length) * 100) : 0;

  return (
    <Card className="border-0 ring-1 ring-border shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Hammer className="h-4 w-4" /> Obra del contratista
          {detail && (
            <span className={`ml-auto whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${workOrderStatusToneClass(detail.order.status)}`}>
              {workOrderStatusLabel(detail.order.status)}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <Skeleton className="h-20 w-full rounded-lg" />
        ) : !detail ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Esta inspección la repara Homie. Asigna la empresa contratista para que registre el trabajo desde su celular.
            </p>
            <div className="space-y-2">
              <Label>Empresa contratista</Label>
              <Select value={selected} onValueChange={setSelected}>
                <SelectTrigger><SelectValue placeholder="Selecciona una empresa" /></SelectTrigger>
                <SelectContent>
                  {contractors.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleAssign} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Hammer className="h-4 w-4 mr-2" />}
              Asignar orden de trabajo
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{workStatusLabel(workStatus)} · {resolved.length} de {items.length} reparaciones</span>
                <span>{pct}%</span>
              </div>
              <Progress value={pct} className="h-1.5" />
            </div>

            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.id} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{item.repair?.title_snapshot ?? 'Reparación'}</p>
                    <span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${workOrderItemToneClass(item.status)}`}>
                      {workOrderItemStatusLabel(item.status)}
                    </span>
                  </div>
                  {item.comment && <p className="text-xs text-muted-foreground">{item.comment}</p>}
                  {item.not_done_reason && (
                    <p className="text-xs text-[hsl(var(--status-needs-changes-fg))]">Motivo: {item.not_done_reason}</p>
                  )}
                  {item.photos.length > 0 ? (
                    <div className="grid grid-cols-6 gap-2">
                      {item.photos.map((p) => (
                        <SignedPhotoImg
                          key={p.id}
                          url=""
                          storagePath={p.storage_path}
                          alt={`Evidencia ${p.photo_stage === 'before' ? 'antes' : 'después'} del trabajo`}
                          loading="lazy"
                          className="aspect-square w-full rounded-md object-cover bg-muted"
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Camera className="h-3 w-3" /> Sin evidencia todavía
                    </p>
                  )}
                </div>
              ))}
            </div>

            {detail.order.contractor_signature_name && (
              <p className="text-xs text-muted-foreground">
                Conformidad firmada por {detail.order.contractor_signature_name}
              </p>
            )}

            {detail.order.status === 'in_review' && (
              <div className="space-y-2 border-t pt-3">
                <Label>Observaciones (obligatorio al devolver)</Label>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
                <div className="flex gap-2">
                  <Button onClick={() => handleReview(true)} disabled={busy}>
                    <Check className="h-4 w-4 mr-2" /> Aprobar obra
                  </Button>
                  <Button variant="outline" onClick={() => handleReview(false)} disabled={busy}>
                    <Undo2 className="h-4 w-4 mr-2" /> Devolver al contratista
                  </Button>
                </div>
              </div>
            )}

            {detail.order.status === 'rejected' && detail.order.review_note && (
              <p className="text-xs text-[hsl(var(--status-needs-changes-fg))]">
                Devuelta: {detail.order.review_note}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
