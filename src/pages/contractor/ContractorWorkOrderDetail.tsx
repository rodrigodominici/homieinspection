import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ChevronRight, MapPin, Loader2, Send, CheckCircle2, Camera } from 'lucide-react';
import { toast } from 'sonner';
import ContractorLayout from './ContractorLayout';
import SignaturePad from '@/components/SignaturePad';
import {
  fetchWorkOrderDetail,
  markWorkOrderInProgress,
  submitWorkOrder,
  type WorkOrderDetail,
} from '@/modules/work-orders/api/work-orders.service';
import {
  isWorkOrderEditable,
  workOrderItemStatusLabel,
  workOrderItemToneClass,
  workOrderStatusLabel,
  workOrderStatusToneClass,
} from '@/lib/work-order-status';

export default function ContractorWorkOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<WorkOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const d = await fetchWorkOrderDetail(id);
      setDetail(d);
      if (d.order.status === 'open') {
        await markWorkOrderInProgress(id).catch(() => undefined);
      }
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
  const allResolved = items.length > 0 && resolved.length === items.length;
  const missingPhotos = items.filter(
    (i) => i.status === 'done' && !i.photos.some((p) => p.photo_stage === 'after'),
  );

  const handleSubmit = async (signerName: string, signatureData: string | null) => {
    if (!id) return;
    setSubmitting(true);
    try {
      await submitWorkOrder(id, signerName, signatureData);
      toast.success('Trabajo enviado a revisión');
      setSigning(false);
      navigate('/contratista');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No pudimos enviar el trabajo');
    } finally {
      setSubmitting(false);
    }
  };

  const propertyName =
    detail?.inspection?.property_name || detail?.inspection?.address || detail?.inspection?.property_id || 'Trabajo';

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
    <ContractorLayout title={propertyName} subtitle={detail?.inspection?.address ?? undefined} backTo="/contratista">
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
        </CardContent>
      </Card>

      <div className="space-y-2">
        {items.map((item) => (
          <Link key={item.id} to={`/contratista/orden/${id}/reparacion/${item.id}`}>
            <Card className="active:scale-[0.99] transition-transform">
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
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </CardContent>
            </Card>
          </Link>
        ))}
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
            disabled={!allResolved || missingPhotos.length > 0 || submitting}
            onClick={() => setSigning(true)}
          >
            {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
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

      <Dialog open={signing} onOpenChange={(o) => !o && setSigning(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Conformidad del trabajo</DialogTitle>
          </DialogHeader>
          <SignaturePad
            onCancel={() => setSigning(false)}
            onConfirm={async ({ signer_name, signature_data }) => {
              await handleSubmit(signer_name, signature_data);
            }}
          />
        </DialogContent>
      </Dialog>
    </ContractorLayout>
  );
}
