import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { SectionStatusBadge } from '@/components/StatusBadge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import type { InspectionSection, InspectionFieldValue, InspectionPhoto, SaveStatus, InspectionReview } from '@/lib/types';
import { ArrowLeft, ArrowRight, Loader2, Trash2, AlertCircle, MessageCircle, KeyRound, Lock, Info } from 'lucide-react';
import PhotoUploadSheet from '@/components/PhotoUploadSheet';
import { cn } from '@/lib/utils';
import { ensureInspectionStatusConsistency, isInspectorReadOnly } from '@/lib/inspection-status-guard';
import { canCompleteSection, isSectionCompleted, isMatrixField, isOperationalSelect } from '@/lib/section-completion';
import SignaturePad from '@/components/SignaturePad';

// ─── Group labels ────────────────────────────────────────────────────────
const PROPERTY_GROUP_LABELS: Record<string, string> = {
  context: 'Datos del Inmueble',
};

const ACCESS_GROUP_LABELS: Record<string, string> = {
  status: 'Estado',
  observation: 'Observaciones',
  photo: 'Fotos',
  keys: 'Llaves / Tarjeta',
};

const KITCHEN_GROUP_LABELS: Record<string, string> = {
  status: 'Estado Cocina',
  appliance: 'Electrodomésticos',
  technical: 'Datos Técnicos',
  logia_matrix: 'Logia o Armario de Boiler/Calentador',
  logia: 'Logia — Observaciones',
};

export default function InspectorSectionComplete() {
  const { id: inspectionId, sectionId } = useParams<{ id: string; sectionId: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { toast } = useToast();

  const [section, setSection] = useState<InspectionSection | null>(null);
  const [allSections, setAllSections] = useState<InspectionSection[]>([]);
  const [fields, setFields] = useState<InspectionFieldValue[]>([]);
  const [photos, setPhotos] = useState<InspectionPhoto[]>([]);
  const [reviews, setReviews] = useState<InspectionReview[]>([]);
  const [inspectionStatus, setInspectionStatus] = useState<string | null>(null);
  const [persistedSignature, setPersistedSignature] = useState<{
    signature_data: string | null;
    signature_status: string;
    signer_name: string | null;
  } | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [uploading, setUploading] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [unansweredFields, setUnansweredFields] = useState<Set<string>>(new Set());
  const [signatureHandled, setSignatureHandled] = useState(false);
  const [showSigPad, setShowSigPad] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const readOnly = isInspectorReadOnly(inspectionStatus);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      const [secRes, allSecRes, fieldRes, photoRes, reviewRes, inspRes, sigRes] = await Promise.all([
        supabase.from('inspection_sections').select('*').eq('id', sectionId!).single(),
        supabase.from('inspection_sections').select('*').eq('inspection_id', inspectionId!).eq('is_visible', true).order('sort_order'),
        supabase.from('inspection_field_values').select('*').eq('inspection_section_id', sectionId!).order('sort_order'),
        supabase.from('inspection_photos').select('*').eq('inspection_section_id', sectionId!).order('sort_order'),
        supabase.from('inspection_reviews').select('*').eq('inspection_section_id', sectionId!).eq('comment_type', 'revision_request').order('created_at', { ascending: false }),
        supabase.from('inspections').select('status').eq('id', inspectionId!).single(),
        supabase.from('inspection_signatures').select('signature_data, signature_status, signer_name').eq('inspection_id', inspectionId!).order('created_at', { ascending: false }).limit(1),
      ]);
      setSection(secRes.data as unknown as InspectionSection);
      setAllSections((allSecRes.data ?? []) as unknown as InspectionSection[]);
      setFields((fieldRes.data ?? []) as unknown as InspectionFieldValue[]);
      setPhotos((photoRes.data ?? []) as unknown as InspectionPhoto[]);
      setReviews((reviewRes.data ?? []) as unknown as InspectionReview[]);
      setInspectionStatus(((inspRes.data as { status?: string } | null)?.status) ?? null);
      const sigRecord = ((sigRes.data ?? []) as Array<typeof persistedSignature extends infer T ? T : never>)[0] ?? null;
      setPersistedSignature(sigRecord as typeof persistedSignature);
      if (sigRecord) setSignatureHandled(true);
      setLoading(false);
    };
    fetch();
  }, [inspectionId, sectionId]);

  useEffect(() => {
    if (sectionId && inspectionId) {
      supabase
        .from('inspections')
        .update({ last_active_section_id: sectionId, last_active_at: new Date().toISOString() })
        .eq('id', inspectionId);
    }
  }, [sectionId, inspectionId]);

  const saveField = useCallback(async (fieldId: string, value: string | null) => {
    setSaveStatus('saving');
    const { error } = await supabase
      .from('inspection_field_values')
      .update({ value_text: value, updated_by: profile?.id, updated_at: new Date().toISOString() })
      .eq('id', fieldId);
    setSaveStatus(error ? 'error' : 'saved');
    if (error) toast({ title: 'Error guardando', variant: 'destructive' });
    setTimeout(() => setSaveStatus('idle'), 2000);
  }, [profile?.id, toast]);

  const handleChipChange = (fieldId: string, value: string) => {
    setFields((prev) => prev.map((f) => f.id === fieldId ? { ...f, value_text: value } : f));
    setValidationError(null);
    setUnansweredFields((prev) => { const n = new Set(prev); n.delete(fieldId); return n; });
    saveField(fieldId, value);
    if (section?.status === 'not_started' || section?.status === 'needs_changes') {
      supabase.from('inspection_sections').update({ status: 'in_progress' }).eq('id', sectionId!);
      setSection((prev) => prev ? { ...prev, status: 'in_progress' } : prev);
    }
    if (inspectionId) ensureInspectionStatusConsistency(inspectionId);
  };

  const handleTextChange = (fieldId: string, value: string) => {
    setFields((prev) => prev.map((f) => f.id === fieldId ? { ...f, value_text: value } : f));
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveField(fieldId, value), 1500);
  };

  const handleTextBlur = (fieldId: string, value: string) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveField(fieldId, value);
  };

  const compressImage = async (file: File): Promise<Blob> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX = 1920;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round((height * MAX) / width); width = MAX; }
          else { width = Math.round((width * MAX) / height); height = MAX; }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => resolve(blob || file), 'image/jpeg', 0.8);
      };
      img.onerror = () => resolve(file);
      img.src = URL.createObjectURL(file);
    });
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !inspectionId || !sectionId || !section) return;

    if (!navigator.onLine) {
      toast({ title: 'Sin conexión', description: 'Foto no subida. Intenta de nuevo cuando tengas conexión.', variant: 'destructive' });
      return;
    }

    for (const file of Array.from(files)) {
      const fileId = crypto.randomUUID();
      setUploading((prev) => new Set(prev).add(fileId));

      try {
        const compressed = await compressImage(file);
        const path = `inspections/${inspectionId}/${section.section_key}/${fileId}.jpg`;
        const { error: uploadError } = await supabase.storage.from('inspection-photos').upload(path, compressed, { contentType: 'image/jpeg' });
        if (uploadError) {
          if (!navigator.onLine) {
            toast({ title: 'Sin conexión', description: 'Foto no subida. Intenta de nuevo cuando tengas conexión.', variant: 'destructive' });
          } else {
            toast({ title: 'Error subiendo foto', description: uploadError.message, variant: 'destructive' });
          }
          setUploading((prev) => { const n = new Set(prev); n.delete(fileId); return n; });
          continue;
        }
        const { data: urlData } = supabase.storage.from('inspection-photos').getPublicUrl(path);
        const { data: photoData, error: photoError } = await supabase
          .from('inspection_photos')
          .insert({
            inspection_id: inspectionId,
            inspection_section_id: sectionId,
            group_key: 'photo',
            storage_bucket: 'inspection-photos',
            storage_path: path,
            public_url: urlData.publicUrl,
            uploaded_by: profile?.id,
            sort_order: photos.length,
          })
          .select()
          .single();
        setUploading((prev) => { const n = new Set(prev); n.delete(fileId); return n; });
        if (!photoError && photoData) {
          setPhotos((prev) => [...prev, photoData as unknown as InspectionPhoto]);
        }
      } catch {
        toast({ title: 'Error de red', description: 'Foto no subida. Verifica tu conexión e intenta de nuevo.', variant: 'destructive' });
        setUploading((prev) => { const n = new Set(prev); n.delete(fileId); return n; });
      }
    }
    e.target.value = '';
  };

  const handleDeletePhoto = async (photo: InspectionPhoto) => {
    await supabase.storage.from('inspection-photos').remove([photo.storage_path]);
    await supabase.from('inspection_photos').delete().eq('id', photo.id);
    setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    toast({ title: 'Foto eliminada' });
  };

  const handleMarkComplete = async () => {
    const result = canCompleteSection(
      section?.section_type ?? '',
      fields,
      section?.section_key,
      photos.length,
    );
    if (!result.valid) {
      setValidationError(result.reason ?? 'Completa los campos requeridos');
      // Populate unanswered fields set for visual feedback
      const missing = new Set<string>();
      fields.forEach((f) => {
        if ((isMatrixField(f) || isOperationalSelect(f)) && (!f.value_text || f.value_text === '')) {
          missing.add(f.id);
        }
      });
      setUnansweredFields(missing);
      return;
    }
    setValidationError(null);
    setUnansweredFields(new Set());

    const { error } = await supabase
      .from('inspection_sections')
      .update({ status: 'completed' })
      .eq('id', sectionId!);
    if (error) {
      toast({ title: 'Error', variant: 'destructive' });
    } else {
      setSection((prev) => prev ? { ...prev, status: 'completed' } : prev);
      setAllSections((prev) => prev.map(s => s.id === sectionId ? { ...s, status: 'completed' } : s));
      if (inspectionId) await ensureInspectionStatusConsistency(inspectionId);
      if (nextSection) {
        goNext();
      } else {
        navigate(`/inspector/inspection/${inspectionId}`);
      }
    }
  };

  const currentIndex = allSections.findIndex((s) => s.id === sectionId);
  const prevSection = currentIndex > 0 ? allSections[currentIndex - 1] : null;
  const nextSection = currentIndex < allSections.length - 1 ? allSections[currentIndex + 1] : null;

  const goPrev = () => {
    if (prevSection) navigate(`/inspector/inspection/${inspectionId}/section/${prevSection.id}`);
  };
  const goNext = () => {
    if (nextSection) {
      navigate(`/inspector/inspection/${inspectionId}/section/${nextSection.id}`);
    } else {
      navigate(`/inspector/inspection/${inspectionId}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background pb-28">
        <header className="sticky top-0 z-10 border-b bg-card/80 backdrop-blur-sm">
          <div className="flex h-14 items-center gap-3 px-4">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-5 w-40" />
          </div>
        </header>
        <div className="px-4 py-4 space-y-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  if (!section) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Sección no encontrada</div>;

  // ─── Group fields by group_key for flexible rendering ───────────────────
  const fieldsByGroup = fields.reduce<Record<string, InspectionFieldValue[]>>((acc, f) => {
    if (!f.is_visible) return acc;
    const key = f.group_key ?? 'other';
    (acc[key] = acc[key] || []).push(f);
    return acc;
  }, {});

  const sectionType = section.section_type;
  const sectionKey = section.section_key;

  // ─── Render helpers ─────────────────────────────────────────────────────

  const renderField = (field: InspectionFieldValue, readOnly = false) => {
    if (field.field_type === 'single_select') {
      const options = (field.value_json as { options?: Array<{ value: string; label: string }> })?.options ?? [];
      const isStatusGrid = options.length === 4 && options.some(o => o.value === 'bueno');
      if (isStatusGrid) {
        const isUnanswered = unansweredFields.has(field.id);
        return (
          <div key={field.id} className={cn("space-y-2 rounded-2xl p-2 -m-2 transition-all", isUnanswered && "ring-2 ring-destructive/60 bg-destructive/5")}>
            <p className={cn("text-body font-medium", isUnanswered && "text-destructive")}>{field.field_label}</p>
            <div className="grid grid-cols-2 gap-3.5">
              {options.map((opt) => {
                const selected = field.value_text === opt.value;
                const colorClass =
                  opt.value === 'bueno' ? 'bg-status-good-bg text-status-good ring-status-good' :
                  opt.value === 'regular' ? 'bg-status-regular-bg text-status-regular ring-status-regular' :
                  opt.value === 'malo' ? 'bg-status-bad-bg text-status-bad ring-status-bad' :
                  'bg-status-na-bg text-status-na ring-status-na';
                return (
                  <button
                    key={opt.value}
                    onClick={() => !readOnly && handleChipChange(field.id, opt.value)}
                    disabled={readOnly}
                    className={cn(
                      'min-h-[56px] rounded-2xl text-body font-semibold transition-all ring-1',
                      selected
                        ? `${colorClass} ring-2 shadow-md scale-[1.02]`
                        : 'bg-muted/50 text-muted-foreground ring-transparent hover:bg-muted active:scale-[0.98]',
                      readOnly && 'opacity-60 cursor-default'
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      }
      // Non-status selector (technical, etc.)
      return (
        <div key={field.id} className="space-y-1">
          <label className="text-tiny font-medium text-muted-foreground">{field.field_label}</label>
          <div className="flex flex-wrap gap-2">
            {options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => !readOnly && handleChipChange(field.id, opt.value)}
                disabled={readOnly}
                className={cn(
                  'px-4 py-2.5 rounded-xl text-caption font-medium transition-all ring-1',
                  field.value_text === opt.value
                    ? 'bg-primary/10 text-primary ring-primary'
                    : 'bg-muted/50 text-muted-foreground ring-transparent hover:bg-muted'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (field.field_type === 'textarea') {
      return (
        <div key={field.id} className="space-y-1">
          <label className="text-body font-medium">{field.field_label}</label>
          <Textarea
            value={field.value_text ?? ''}
            onChange={(e) => handleTextChange(field.id, e.target.value)}
            onBlur={(e) => handleTextBlur(field.id, e.target.value)}
            placeholder="Describe lo que observas..."
            rows={4}
            className="rounded-xl"
            disabled={readOnly}
          />
        </div>
      );
    }

    if (field.field_type === 'photo_upload') {
      return null; // Photos handled separately
    }

    // text, number, email, phone, date
    return (
      <div key={field.id} className="space-y-1">
        <label className="text-tiny font-medium text-muted-foreground">{field.field_label}</label>
        {readOnly ? (
          <p className="text-body font-medium px-3 py-2.5 rounded-xl bg-muted/30 min-h-[44px] flex items-center">
            {field.value_text || '—'}
          </p>
        ) : (
          <Input
            value={field.value_text ?? ''}
            onChange={(e) => handleTextChange(field.id, e.target.value)}
            onBlur={(e) => handleTextBlur(field.id, e.target.value)}
            type={field.field_type === 'number' ? 'number' : field.field_type === 'email' ? 'email' : field.field_type === 'phone' ? 'tel' : field.field_type === 'date' ? 'date' : 'text'}
            className="rounded-xl h-11"
          />
        )}
      </div>
    );
  };

  const renderGroupCard = (groupFields: InspectionFieldValue[], title?: string, readOnly = false) => {
    const nonPhotoFields = groupFields.filter(f => f.field_type !== 'photo_upload');
    if (nonPhotoFields.length === 0) return null;
    return (
      <Card className="border-0 ring-1 ring-border shadow-sm rounded-2xl">
        <CardContent className="p-4 space-y-3">
          {title && <p className="text-body font-semibold text-muted-foreground">{title}</p>}
          {nonPhotoFields.map(f => renderField(f, readOnly))}
        </CardContent>
      </Card>
    );
  };

  // ─── Section-type-specific rendering ────────────────────────────────────

  const renderIntroduction = () => {
    const cleaningFields = fieldsByGroup['cleaning'] || [];
    const removalFields = fieldsByGroup['removal'] || [];
    const fumigationFields = fieldsByGroup['fumigation'] || [];

    return (
      <>
        {cleaningFields.length > 0 && renderGroupCard(cleaningFields, INTRO_GROUP_LABELS.cleaning)}
        {removalFields.length > 0 && renderGroupCard(removalFields, INTRO_GROUP_LABELS.removal)}
        {fumigationFields.length > 0 && renderGroupCard(fumigationFields, INTRO_GROUP_LABELS.fumigation)}
      </>
    );
  };

  const renderReceptionMeta = () => {
    const contextFields = fieldsByGroup['context'] || [];
    const meterFields = fieldsByGroup['meters'] || [];
    const adminFields = fieldsByGroup['admin_contact'] || [];

    return (
      <>
        {contextFields.length > 0 && (
          <Card className="border-0 ring-1 ring-border shadow-sm rounded-2xl bg-muted/20">
            <CardContent className="p-4 space-y-3">
              <p className="text-body font-semibold text-muted-foreground">Datos del Inmueble</p>
              {contextFields.map(f => renderField(f, true))}
            </CardContent>
          </Card>
        )}
        {meterFields.length > 0 && renderGroupCard(meterFields, PROPERTY_GROUP_LABELS.meters)}
        {adminFields.length > 0 && renderGroupCard(adminFields, PROPERTY_GROUP_LABELS.admin_contact)}
      </>
    );
  };

  const renderKitchenSection = () => {
    const statusFields = fieldsByGroup['status'] || [];
    const applianceFields = fieldsByGroup['appliance'] || [];
    const technicalFields = fieldsByGroup['technical'] || [];
    const logiaMatrixFields = fieldsByGroup['logia_matrix'] || [];
    const logiaFields = fieldsByGroup['logia'] || [];
    const observationFields = fieldsByGroup['observation'] || [];

    return (
      <>
        {statusFields.length > 0 && (
          <Card className="border-0 ring-1 ring-border shadow-sm rounded-2xl">
            <CardContent className="p-4 space-y-4">
              <p className="text-body font-semibold">{KITCHEN_GROUP_LABELS.status}</p>
              {statusFields.map(f => renderField(f))}
            </CardContent>
          </Card>
        )}
        {applianceFields.length > 0 && (
          <Card className="border-0 ring-1 ring-border shadow-sm rounded-2xl">
            <CardContent className="p-4 space-y-4">
              <p className="text-body font-semibold">{KITCHEN_GROUP_LABELS.appliance}</p>
              {applianceFields.map(f => renderField(f))}
            </CardContent>
          </Card>
        )}
        {technicalFields.length > 0 && renderGroupCard(technicalFields, KITCHEN_GROUP_LABELS.technical)}
        {logiaMatrixFields.length > 0 && (
          <Card className="border-0 ring-1 ring-primary/20 shadow-sm rounded-2xl bg-primary/[0.02]">
            <CardContent className="p-4 space-y-4">
              <p className="text-body font-semibold">{KITCHEN_GROUP_LABELS.logia_matrix}</p>
              {logiaMatrixFields.map(f => renderField(f))}
            </CardContent>
          </Card>
        )}
        {logiaFields.length > 0 && (
          <Card className="border-0 ring-1 ring-border shadow-sm rounded-2xl">
            <CardContent className="p-4 space-y-4">
              <p className="text-body font-semibold">{KITCHEN_GROUP_LABELS.logia}</p>
              {logiaFields.map(f => renderField(f))}
            </CardContent>
          </Card>
        )}
        {observationFields.length > 0 && observationFields.map(f => (
          <Card key={f.id} className="border-0 ring-1 ring-border shadow-sm rounded-2xl">
            <CardContent className="p-4 space-y-2">
              {renderField(f)}
            </CardContent>
          </Card>
        ))}
      </>
    );
  };

  const renderSignatureSection = () => {
    const observationFields = fieldsByGroup['observation'] || [];

    const handleSigConfirm = async (data: {
      signature_data: string | null;
      signature_status: 'signed' | 'refused' | 'unavailable';
      signer_name: string;
      skip_reason: string | null;
    }) => {
      await supabase.from('inspection_signatures').delete().eq('inspection_id', inspectionId!);
      await supabase.from('inspection_signatures').insert({
        inspection_id: inspectionId!,
        signer_name: data.signer_name || null,
        signature_data: data.signature_data,
        signature_status: data.signature_status,
        skip_reason: data.skip_reason,
        created_by: profile?.id,
      });
      setSignatureHandled(true);
      setShowSigPad(false);
    };

    return (
      <>
        {observationFields.length > 0 && observationFields.map(f => (
          <Card key={f.id} className="border-0 ring-1 ring-border shadow-sm rounded-2xl">
            <CardContent className="p-4 space-y-2">
              {renderField(f)}
            </CardContent>
          </Card>
        ))}

        <Card className="border-0 ring-1 ring-primary/20 shadow-sm rounded-2xl bg-primary/[0.03]">
          <CardContent className="p-4 space-y-3">
            <p className="text-body font-semibold">Firma del Inquilino</p>
            {signatureHandled ? (
              <p className="text-caption text-status-good font-medium">✓ Firma registrada</p>
            ) : showSigPad ? (
              <SignaturePad
                onConfirm={handleSigConfirm}
                onCancel={() => setShowSigPad(false)}
              />
            ) : (
              <Button onClick={() => setShowSigPad(true)} className="w-full h-11 rounded-xl">
                Obtener firma del inquilino
              </Button>
            )}
          </CardContent>
        </Card>
      </>
    );
  };

  const renderClosingOperational = () => {
    const operationalFields = fieldsByGroup['operational'] || [];
    return (
      <>
        {operationalFields.length > 0 && (
          <Card className="border-0 ring-1 ring-border shadow-sm rounded-2xl">
            <CardContent className="p-4 space-y-5">
              {operationalFields.map(f => renderField(f))}
            </CardContent>
          </Card>
        )}
      </>
    );
  };

  const renderStandardSection = () => {
    const statusFields = fieldsByGroup['status'] || [];
    const observationFields = fieldsByGroup['observation'] || [];
    const infoFields = fieldsByGroup['info'] || [];
    const technicalFields = fieldsByGroup['technical'] || [];
    const measurementFields = fieldsByGroup['measurement'] || [];

    return (
      <>
        {infoFields.length > 0 && renderGroupCard(infoFields)}
        {statusFields.length > 0 && (
          <Card className="border-0 ring-1 ring-border shadow-sm rounded-2xl">
            <CardContent className="p-4 space-y-4">
              {statusFields.map(f => renderField(f))}
            </CardContent>
          </Card>
        )}
        {technicalFields.length > 0 && renderGroupCard(technicalFields, 'Datos Técnicos')}
        {measurementFields.length > 0 && renderGroupCard(measurementFields, 'Mediciones')}
        {observationFields.map(f => (
          <Card key={f.id} className="border-0 ring-1 ring-border shadow-sm rounded-2xl">
            <CardContent className="p-4 space-y-2">
              {renderField(f)}
            </CardContent>
          </Card>
        ))}
      </>
    );
  };

  // ─── Main render ────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-muted/30 pb-32">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-card/80 backdrop-blur-sm">
        <div className="flex h-14 items-center gap-3 px-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/inspector/inspection/${inspectionId}`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-body truncate">{section.section_title}</p>
            <p className="text-tiny text-muted-foreground">{currentIndex + 1} de {allSections.length}</p>
          </div>
          <SectionStatusBadge status={section.status} />
        </div>
        {/* Save indicator */}
        <div className="h-1 relative">
          {saveStatus === 'saving' && <div className="absolute inset-0 bg-primary/30 animate-pulse" />}
          {saveStatus === 'saved' && <div className="absolute inset-0 bg-status-good/50 transition-opacity duration-1000" />}
          {saveStatus === 'error' && <div className="absolute inset-0 bg-destructive/50" />}
        </div>
      </header>

      <main className="px-4 py-4 space-y-4">
        {/* Revision requests */}
        {reviews.length > 0 && section.status === 'needs_changes' && (
          <Card className="border-0 ring-1 ring-status-bad/30 bg-status-bad-bg shadow-sm rounded-2xl">
            <CardContent className="p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-status-bad mt-0.5 shrink-0" />
                <div>
                  <p className="text-body font-medium text-status-bad">Cambios Requeridos</p>
                  {reviews.map((r) => (
                    <p key={r.id} className="text-caption text-foreground/80 mt-1">{r.comment}</p>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Section-type-specific content */}
        {sectionType === 'introduction' && renderIntroduction()}
        {sectionType === 'reception_meta' && renderReceptionMeta()}
        {sectionType === 'space_kitchen' && renderKitchenSection()}
        {sectionType === 'signature' && renderSignatureSection()}
        {sectionType === 'closing_operational' && renderClosingOperational()}
        {(sectionType === 'space_standard' || sectionType === 'space_secondary' || sectionType === 'handover_meta' || sectionType === 'closing_summary') && renderStandardSection()}

        {/* Inline validation error */}
        {validationError && (
          <div className="flex items-center gap-2 px-1">
            <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
            <p className="text-caption text-destructive font-medium">{validationError}</p>
          </div>
        )}

        {/* Photos */}
        {sectionType !== 'signature' && (
          <Card className="border-0 ring-1 ring-border shadow-sm rounded-2xl">
            <CardContent className="p-4">
              <p className="text-body font-medium mb-3">Fotos</p>
              <div className="grid grid-cols-2 gap-2.5">
                <PhotoUploadSheet onFiles={(files) => {
                  const dt = new DataTransfer();
                  Array.from(files).forEach((f) => dt.items.add(f));
                  const synth = { target: { files: dt.files, value: '' } } as unknown as React.ChangeEvent<HTMLInputElement>;
                  handlePhotoUpload(synth);
                }} />
                {Array.from(uploading).map((uid) => (
                  <div key={uid} className="aspect-square rounded-2xl bg-muted flex items-center justify-center">
                    <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
                  </div>
                ))}
                {photos.map((photo) => (
                  <div key={photo.id} className="aspect-square rounded-2xl overflow-hidden relative group">
                    <img
                      src={photo.public_url ?? ''}
                      alt={photo.caption ?? 'Foto'}
                      className="w-full h-full object-cover"
                    />
                    <button
                      onClick={() => handleDeletePhoto(photo)}
                      className="absolute top-1 right-1 h-7 w-7 rounded-full bg-destructive/80 text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Sticky bottom navigation */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-card/90 backdrop-blur-sm border-t space-y-2 safe-area-bottom">
        {(() => {
          const completed = isSectionCompleted(section.status);
          const isLast = !nextSection;
          return (
            <>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={goPrev}
                  disabled={!prevSection}
                  className="flex-1 h-12 rounded-xl"
                >
                  <ArrowLeft className="mr-1 h-4 w-4" /> Anterior
                </Button>

                {!completed ? (
                  <Button
                    className="flex-1 h-12 rounded-xl"
                    onClick={handleMarkComplete}
                  >
                    Completar sección
                  </Button>
                ) : (
                  <Button
                    className="flex-1 h-12 rounded-xl"
                    onClick={isLast ? () => navigate(`/inspector/inspection/${inspectionId}`) : goNext}
                  >
                    {isLast ? 'Finalizar inspección' : 'Siguiente'}
                    {!isLast && <ArrowRight className="ml-1 h-4 w-4" />}
                  </Button>
                )}
              </div>
              <div className="text-center text-tiny text-muted-foreground">
                {saveStatus === 'saving' && <span className="flex items-center justify-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Guardando...</span>}
                {saveStatus === 'saved' && <span className="text-status-good">✓ Guardado</span>}
                {saveStatus === 'error' && <span className="text-destructive">Error al guardar</span>}
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}
