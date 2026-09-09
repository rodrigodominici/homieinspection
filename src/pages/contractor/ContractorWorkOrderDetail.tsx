import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  ChevronRight, MapPin, Loader2, Send, CheckCircle2, Camera, ClipboardList, ThumbsUp, XCircle, KeyRound,
} from 'lucide-react';
import { toast } from 'sonner';
import ContractorLayout from './ContractorLayout';
import SignaturePad from '@/components/SignaturePad';
import {
  fetchWorkOrderDetail,
  acceptWorkOrder,
  rejectWorkOrderByContractor,
  submitWorkOrder,
  type WorkOrderDetail,
} from '@/modules/work-orders/api/work-orders.service';
import {
  isWorkOrderEditable,
  isWorkOrderPendingAcceptance,
  keysStatusLabel,
  workOrderItemStatusLabel,
  workOrderItemToneClass,
  workOrderStatusLabel,
  workOrderStatusToneClass,
  KEYS_STATUS_OPTIONS,
} from '@/lib/work-order-status';

export default function ContractorWorkOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<WorkOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const [keysStatus, setKeysStatus] = useState('');
  const [lockNumber, setLockNumber] = useState('');
  const [lockCode, setLockCode] = useState('');
  const [signing, setSigning] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const d = await fetchWorkOrderDetail(id);
      setDetail(d);
      setKeysStatus(d.order.keys_status ?? '');
      setLockNumber(d.order.keys_lock_number ?? '');
      setLockCode(d.order.keys_lock_code ?? '');
    } catch {
      toast.error('No pudimos abrir este trabajo');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const items = detail?.items ?? [];
  const resolved = items.filter((i) => i.status === 'done' || i.status === 'not_done');
  const pct = items.length > 0 ? Math.round((resolved.length / items.length) * 100) : 0;
  const editable = isWorkOrderEditable(detail?.order.status);
  const pendingAcceptance = isWorkOrderPendingAcceptance(detail?.order.status);
  const allResolved = items.length > 0 && resolved.length === items.length;
  const missingPhotos = items.filter(
    (i) => i.status === 'done' && !i.photos.some((p) => p.photo_stage === 'after'),
  );

  const handleAccept = async () => {
    if (!id) return;
    setBusy(true);
    try {
      await acceptWorkOrder(id);
      toast.success('Trabajo aceptado. Ya podés registrar las reparaciones.');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No pudimos aceptar el trabajo');
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    if (!id) return;
    if (!rejectReason.trim()) { toast.error('Contanos por qué rechazás el trabajo'); return; }
    setBusy(true);
    try {
      await rejectWorkOrderByContractor(id, rejectReason.trim());
      toast.success('Trabajo rechazado. Homie va a reasignarlo.');
      setRejecting(false);
      navigate('/contratista');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No pudimos registrar el rechazo');
    } finally {
      setBusy(false);
    }
  };

  const keysValid =
    !!keysStatus && (keysStatus !== 'candado' || (lockNumber.trim() !== '' && lockCode.trim() !== ''));

  const handleSubmit = async (signerName: string, signatureData: string | null) => {
    if (!id) return;
    setBusy(true);
    try {
      await submitWorkOrder(id, signerName, signatureData, {
        keys_status: keysStatus,
        keys_lock_number: keysStatus === 'candado' ? lockNumber.trim() : null,
        keys_lock_code: keysStatus === 'candado' ? lockCode.trim() : null,
      });
      toast.success('Trabajo enviado a revisión');
      setSigning(false);
      setClosing(false);
      navigate('/contratista');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No pudimos enviar el trabajo');
    } finally {
      setBusy(false);
    }
  };

  const propertyName =
    detail?.inspection?.address || detail?.inspection?.property_id || 'Trabajo';

  if (loading) {
    return (
      <ContractorLayout title="Trabajo" backTo="/contratista">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </ContractorLayout>
    );
  }

  return (
    <ContractorLayout title={propertyName} subtitle={detail?.inspection?.property_id ?? undefined} backTo="/contratista">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs text-muted-foreground flex items-center gap-1 min-w-0">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{detail?.inspection?.address || '—'}</span>
            </p>
            <span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${workOrderStatusToneClass(detail?.order.status)}`}>
              {workOrderStatusLabel(detail?.order.status)}
            </span>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{resolved.length} de {items.length} reparaciones registradas</span>
              <span>{pct}%</span>
            </div>
            <Progress value={pct} className="h-1.5" />
          </div>
          {detail?.order.status === 'rejected' && detail.order.review_note && (
            <p className="text-xs text-[hsl(var(--status-needs-changes-fg))]">
              Devuelta con observaciones: {detail.order.review_note}
            </p>
          )}
          {detail?.order.status === 'in_review' && (
            <p className="text-xs text-muted-foreground">Enviado a revisión. Homie va a revisar tu registro.</p>
          )}
          {detail?.order.keys_status && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <KeyRound className="h-3 w-3" /> Llaves: {keysStatusLabel(detail.order.keys_status)}
              {detail.order.keys_status === 'candado' && detail.order.keys_lock_number
                ? ` · candado ${detail.order.keys_lock_number}`
                : ''}
            </p>
          )}
        </CardContent>
      </Card>

      <Link to={`/contratista/orden/${id}/informe`}>
        <Card className="active:scale-[0.99] transition-transform">
          <CardContent className="p-4 flex items-center gap-3">
            <ClipboardList className="h-4 w-4 text-primary shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Informe de hallazgos</p>
              <p className="text-xs text-muted-foreground">Qué se detectó y qué trabajos se solicitan</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </CardContent>
        </Card>
      </Link>

      {pendingAcceptance && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <p className="text-sm">
              Revisá el informe de hallazgos y los {items.length} trabajos solicitados. Para empezar a registrar,
              aceptá el trabajo.
            </p>
            <div className="flex flex-col gap-2">
              <Button className="w-full h-11" onClick={handleAccept} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ThumbsUp className="h-4 w-4 mr-2" />}
                Aceptar el trabajo
              </Button>
              <Button variant="outline" className="w-full h-11" onClick={() => setRejecting(true)} disabled={busy}>
                <XCircle className="h-4 w-4 mr-2" /> Rechazar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {items.map((item) => {
          const card = (
            <Card className={pendingAcceptance ? 'opacity-70' : 'active:scale-[0.99] transition-transform'}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-medium leading-snug">{item.repair?.title_snapshot ?? 'Reparación'}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${workOrderItemToneClass(item.status)}`}>
                      {workOrderItemStatusLabel(item.status)}
                    </span>
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Camera className="h-3 w-3" /> {item.photos.length}
                    </span>
                  </div>
                </div>
                {!pendingAcceptance && <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
              </CardContent>
            </Card>
          );
          return pendingAcceptance ? (
            <div key={item.id}>{card}</div>
          ) : (
            <Link key={item.id} to={`/contratista/orden/${id}/reparacion/${item.id}`}>{card}</Link>
          );
        })}
      </div>

      {editable && (
        <div className="sticky bottom-20 space-y-2">
          {!allResolved && (
            <p className="text-xs text-muted-foreground text-center">
              Registrá todas las reparaciones antes de enviar.
            </p>
          )}
          {allResolved && missingPhotos.length > 0 && (
            <p className="text-xs text-center text-[hsl(var(--status-needs-changes-fg))]">
              Faltan fotos del después en {missingPhotos.length} {missingPhotos.length === 1 ? 'reparación' : 'reparaciones'}.
            </p>
          )}
          <Button
            className="w-full h-12"
            disabled={!allResolved || missingPhotos.length > 0 || busy}
            onClick={() => setClosing(true)}
          >
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Enviar trabajo a revisión
          </Button>
        </div>
      )}

      {detail?.order.status === 'approved' && (
        <Card>
          <CardContent className="p-4 flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-[hsl(var(--status-approved-fg))]" />
            Trabajo aprobado por Homie.
          </CardContent>
        </Card>
      )}

      <Dialog open={rejecting} onOpenChange={(o) => !o && setRejecting(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rechazar el trabajo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="reject-reason" className="text-sm">Motivo del rechazo</Label>
            <Textarea
              id="reject-reason"
              rows={4}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Ej: no trabajamos ese tipo de reparación en la comuna"
            />
            <div className="flex flex-col gap-2">
              <Button variant="destructive" className="h-11" onClick={handleReject} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Confirmar rechazo
              </Button>
              <Button variant="outline" className="h-11" onClick={() => setRejecting(false)} disabled={busy}>
                Cancelar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={closing}
        onOpenChange={(o) => { if (!o) { setClosing(false); setSigning(false); } }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{signing ? 'Conformidad del trabajo' : 'Estado de las llaves'}</DialogTitle>
          </DialogHeader>
          {signing ? (
            <SignaturePad
              onCancel={() => setSigning(false)}
              onConfirm={async ({ signer_name, signature_data }) => {
                await handleSubmit(signer_name, signature_data);
              }}
            />
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-sm">¿Con quién quedaron las llaves?</Label>
                <Select value={keysStatus} onValueChange={setKeysStatus}>
                  <SelectTrigger><SelectValue placeholder="Seleccioná una opción" /></SelectTrigger>
                  <SelectContent>
                    {KEYS_STATUS_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {keysStatus === 'candado' && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="lock-number" className="text-sm">Número de candado</Label>
                    <Input id="lock-number" value={lockNumber} onChange={(e) => setLockNumber(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="lock-code" className="text-sm">Clave del candado</Label>
                    <Input id="lock-code" value={lockCode} onChange={(e) => setLockCode(e.target.value)} />
                  </div>
                </>
              )}
              <Button className="w-full h-11" disabled={!keysValid} onClick={() => setSigning(true)}>
                Continuar a la firma
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </ContractorLayout>
  );
}
