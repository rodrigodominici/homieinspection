import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Hammer, Loader2, Check, Undo2, Camera, KeyRound, Repeat } from 'lucide-react';
import { toast } from 'sonner';
import SignedPhotoImg from '@/components/SignedPhotoImg';
import { MoneyDisplay } from '@/shared/ui/MoneyDisplay';
import { supabase } from '@/integrations/supabase/client';
import {
  assignWorkOrder,
  fetchFindingsReport,
  fetchWorkOrderByInspection,
  reassignWorkOrder,
  reviewWorkOrder,
  type FindingsReport,
  type WorkOrderDetail,
} from '@/modules/work-orders/api/work-orders.service';
import {
  keysStatusLabel,
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

interface QuotedRepair {
  id: string;
  title_snapshot: string;
  quantity: number;
  unit: string;
  unit_price: number;
  subtotal: number | null;
}

/** Panel de obra para Admin y Ejecutivo: asignación, avance, comparación y revisión. */
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
  const [reassignTo, setReassignTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [findings, setFindings] = useState<FindingsReport | null>(null);
  const [quoted, setQuoted] = useState<QuotedRepair[]>([]);

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

  useEffect(() => {
    if (!detail) return;
    let cancelled = false;
    fetchFindingsReport(inspectionId)
      .then((r) => { if (!cancelled) setFindings(r); })
      .catch(() => undefined);
    supabase
      .from('inspection_repair_items')
      .select('id,title_snapshot,quantity,unit,unit_price,subtotal,sort_order')
      .eq('inspection_id', inspectionId)
      .order('sort_order')
      .then(({ data }) => { if (!cancelled) setQuoted((data ?? []) as unknown as QuotedRepair[]); });
    return () => { cancelled = true; };
  }, [detail, inspectionId]);

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

  const handleReassign = async () => {
    if (!detail) return;
    if (!reassignTo) { toast.error('Selecciona la nueva empresa contratista'); return; }
    setBusy(true);
    try {
      await reassignWorkOrder(detail.order.id, reassignTo);
      toast.success('Orden reasignada');
      setReassignTo('');
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo reasignar la orden');
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
  const contractorName = contractors.find((c) => c.id === detail?.order.contractor_id)?.name;

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
                <span>
                  {workStatusLabel(workStatus)} · {resolved.length} de {items.length} reparaciones
                  {contractorName ? ` · ${contractorName}` : ''}
                </span>
                <span>{pct}%</span>
              </div>
              <Progress value={pct} className="h-1.5" />
            </div>

            {detail.order.status === 'contractor_rejected' && (
              <p className="text-xs text-[hsl(var(--status-needs-changes-fg))]">
                El contratista rechazó la orden: {detail.order.contractor_rejection_reason}
              </p>
            )}

            <Accordion type="multiple" defaultValue={['ejecucion']} className="w-full">
              <AccordionItem value="hallazgos">
                <AccordionTrigger className="text-sm">1. Informe de hallazgos</AccordionTrigger>
                <AccordionContent className="space-y-3">
                  {!findings ? (
                    <Skeleton className="h-16 w-full rounded-lg" />
                  ) : findings.sections.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Sin hallazgos registrados.</p>
                  ) : (
                    findings.sections.map((s) => (
                      <div key={s.id} className="rounded-lg border p-3 space-y-2">
                        <p className="text-sm font-medium">{s.section_title}</p>
                        {s.final_observation && (
                          <p className="text-xs text-muted-foreground whitespace-pre-line">{s.final_observation}</p>
                        )}
                        {s.photos.length > 0 && (
                          <div className="grid grid-cols-6 gap-2">
                            {s.photos.slice(0, 12).map((p) => (
                              <SignedPhotoImg
                                key={p.id}
                                url=""
                                storagePath={p.storage_path}
                                alt={p.caption ?? `Foto de ${s.section_title}`}
                                loading="lazy"
                                className="aspect-square w-full rounded-md object-cover bg-muted"
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="cotizacion">
                <AccordionTrigger className="text-sm">2. Cotización aprobada</AccordionTrigger>
                <AccordionContent>
                  {quoted.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Sin reparaciones cotizadas.</p>
                  ) : (
                    <div className="space-y-2">
                      {quoted.map((r) => (
                        <div key={r.id} className="flex items-center justify-between gap-2 text-xs border-b pb-1">
                          <span className="min-w-0 truncate">{r.title_snapshot}</span>
                          <span className="shrink-0 text-muted-foreground">
                            {r.quantity} {r.unit} ·{' '}
                            <MoneyDisplay value={r.subtotal ?? r.quantity * r.unit_price} market={market} />
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="ejecucion">
                <AccordionTrigger className="text-sm">3. Informe final de ejecución</AccordionTrigger>
                <AccordionContent className="space-y-3">
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
                      {item.actual_cost != null && (
                        <p className="text-xs text-muted-foreground">
                          Costo informado (histórico): <MoneyDisplay value={item.actual_cost} market={market} />
                        </p>
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

                  {detail.order.keys_status && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <KeyRound className="h-3 w-3" /> Llaves: {keysStatusLabel(detail.order.keys_status)}
                      {detail.order.keys_status === 'candado'
                        ? ` · candado ${detail.order.keys_lock_number ?? '—'} / clave ${detail.order.keys_lock_code ?? '—'}`
                        : ''}
                    </p>
                  )}
                  {detail.order.contractor_signature_name && (
                    <p className="text-xs text-muted-foreground">
                      Conformidad firmada por {detail.order.contractor_signature_name}
                    </p>
                  )}
                </AccordionContent>
              </AccordionItem>
            </Accordion>

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

            {detail.order.status !== 'approved' && (
              <div className="space-y-2 border-t pt-3">
                <Label>Reasignar a otra empresa contratista</Label>
                <Select value={reassignTo} onValueChange={setReassignTo}>
                  <SelectTrigger><SelectValue placeholder="Selecciona una empresa" /></SelectTrigger>
                  <SelectContent>
                    {contractors
                      .filter((c) => c.id !== detail.order.contractor_id)
                      .map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={handleReassign} disabled={busy}>
                  <Repeat className="h-4 w-4 mr-2" /> Reasignar orden
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
