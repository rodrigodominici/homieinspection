import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Camera, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import ContractorLayout from './ContractorLayout';
import SignedPhotoImg from '@/components/SignedPhotoImg';
import { uploadInspectionPhotos } from '@/shared/lib/inspection-photos';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchWorkOrderDetail,
  updateWorkOrderItem,
  type WorkOrderItemDetail,
} from '@/modules/work-orders/api/work-orders.service';
import { isWorkOrderEditable, type WorkOrderItemStatus } from '@/lib/work-order-status';
import { cn } from '@/lib/utils';

const STATUS_OPTIONS: { value: WorkOrderItemStatus; label: string }[] = [
  { value: 'in_progress', label: 'En curso' },
  { value: 'done', label: 'Terminada' },
  { value: 'not_done', label: 'No realizada' },
];

export default function ContractorItemDetail() {
  const { id, itemId } = useParams<{ id: string; itemId: string }>();
  const { profile } = useAuth();
  const [item, setItem] = useState<WorkOrderItemDetail | null>(null);
  const [inspectionId, setInspectionId] = useState<string | null>(null);
  const [orderStatus, setOrderStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingStage, setUploadingStage] = useState<'before' | 'after' | null>(null);

  const [status, setStatus] = useState<WorkOrderItemStatus>('pending');
  const [comment, setComment] = useState('');
  const [notDoneReason, setNotDoneReason] = useState('');

  const beforeInput = useRef<HTMLInputElement>(null);
  const afterInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!id || !itemId) return;
    try {
      const detail = await fetchWorkOrderDetail(id);
      const found = detail.items.find((i) => i.id === itemId) ?? null;
      setItem(found);
      setInspectionId(detail.order.inspection_id);
      setOrderStatus(detail.order.status);
      if (found) {
        setStatus(found.status);
        setComment(found.comment ?? '');
        setNotDoneReason(found.not_done_reason ?? '');
      }
    } catch {
      toast.error('No pudimos abrir esta reparación');
    } finally {
      setLoading(false);
    }
  }, [id, itemId]);

  useEffect(() => { void load(); }, [load]);

  const editable = isWorkOrderEditable(orderStatus);
  const before = useMemo(() => (item?.photos ?? []).filter((p) => p.photo_stage === 'before'), [item]);
  const after = useMemo(() => (item?.photos ?? []).filter((p) => p.photo_stage !== 'before'), [item]);

  const handleSave = async () => {
    if (!itemId) return;
    if (status === 'not_done' && !notDoneReason.trim()) {
      toast.error('Contanos por qué no se realizó');
      return;
    }
    setSaving(true);
    try {
      await updateWorkOrderItem(itemId, {
        status,
        comment: comment.trim() || null,
        not_done_reason: status === 'not_done' ? notDoneReason.trim() : null,
      });
      toast.success('Registro guardado');
      await load();
    } catch {
      toast.error('No pudimos guardar el registro');
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async (files: FileList | null, stage: 'before' | 'after') => {
    if (!files || files.length === 0 || !inspectionId || !item?.repair || !itemId) return;
    setUploadingStage(stage);
    try {
      await uploadInspectionPhotos({
        inspectionId,
        sectionId: item.repair.inspection_section_id,
        sectionKey: `obra-${stage}`,
        files: Array.from(files),
        uploadedBy: profile?.id,
        startingSortOrder: (item.photos.length ?? 0),
        workOrderItemId: itemId,
        photoStage: stage,
      });
      toast.success('Fotos subidas');
      await load();
    } catch {
      toast.error('No pudimos subir las fotos');
    } finally {
      setUploadingStage(null);
    }
  };

  if (loading) {
    return (
      <ContractorLayout title="Reparación" backTo={`/contratista/orden/${id}`}>
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </ContractorLayout>
    );
  }

  const renderGallery = (photos: typeof before, stage: 'before' | 'after') => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{stage === 'before' ? 'Antes' : 'Después'}</p>
        {editable && (
          <Button
            variant="outline"
            size="sm"
            disabled={uploadingStage !== null}
            onClick={() => (stage === 'before' ? beforeInput : afterInput).current?.click()}
          >
            {uploadingStage === stage ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Camera className="h-3.5 w-3.5 mr-1" />}
            Agregar
          </Button>
        )}
      </div>
      {photos.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin fotos.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <SignedPhotoImg
              key={p.id}
              url=""
              storagePath={p.storage_path}
              alt={`Foto ${stage === 'before' ? 'antes' : 'después'} de la reparación`}
              loading="lazy"
              className="aspect-square w-full rounded-lg object-cover bg-muted"
            />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <ContractorLayout
      title={item?.repair?.title_snapshot ?? 'Reparación'}
      subtitle={item?.repair?.category_snapshot ?? undefined}
      backTo={`/contratista/orden/${id}`}
    >
      <Card>
        <CardContent className="p-4 space-y-2 text-sm">
          {item?.repair?.description_snapshot && (
            <p className="text-muted-foreground">{item.repair.description_snapshot}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Cantidad: {item?.repair?.quantity ?? '—'} {item?.repair?.unit ?? ''}
          </p>
          {item?.repair?.notes && <p className="text-xs text-muted-foreground">Nota: {item.repair.notes}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="space-y-2">
            <Label className="text-sm">Estado del trabajo</Label>
            <div className="grid grid-cols-3 gap-2">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={!editable}
                  onClick={() => setStatus(opt.value)}
                  className={cn(
                    'rounded-lg border px-2 py-2 text-xs font-medium transition-colors',
                    status === opt.value ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground',
                    !editable && 'opacity-60',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {status === 'not_done' && (
            <div className="space-y-1.5">
              <Label htmlFor="reason" className="text-sm">Motivo</Label>
              <Textarea id="reason" value={notDoneReason} disabled={!editable} onChange={(e) => setNotDoneReason(e.target.value)} rows={3} />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="comment" className="text-sm">Comentario del trabajo</Label>
            <Textarea id="comment" value={comment} disabled={!editable} onChange={(e) => setComment(e.target.value)} rows={3} />
          </div>

          {editable && (
            <Button className="w-full h-11" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Guardar registro
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-4">
          {renderGallery(before, 'before')}
          {renderGallery(after, 'after')}
        </CardContent>
      </Card>

      <input ref={beforeInput} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { void handleUpload(e.target.files, 'before'); e.target.value = ''; }} />
      <input ref={afterInput} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { void handleUpload(e.target.files, 'after'); e.target.value = ''; }} />
    </ContractorLayout>
  );
}
