import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { SectionStatusBadge } from '@/components/StatusBadge';
import InspectorStatusBadge from '@/components/InspectorStatusBadge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { calculateProgress } from '@/lib/inspection-utils';
import { ensureInspectionStatusConsistency, isInspectorReadOnly } from '@/lib/inspection-status-guard';
import { isSectionCompleted, canFinalizeInspection } from '@/lib/section-completion';
import PropertyBriefingCard from '@/components/PropertyBriefingCard';
import SignaturePad from '@/components/SignaturePad';
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
import { getEffectiveSnapshot } from '@/lib/inspection-utils';
import type { Inspection, InspectionFieldValue, InspectionSection, InspectionPhoto } from '@/lib/types';
import { ArrowLeft, ArrowRight, Send, CheckCircle2, MessageCircle, CalendarClock, Edit3, Clock, Camera, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getInspectorDisplayState } from '@/lib/inspector-operational';
import { triggerKeyCollectionSync, syncCheckoutIfApplicable } from '@/lib/hubspot-sync';

export default function InspectorInspectionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useAuth();
  const { toast } = useToast();
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [sections, setSections] = useState<InspectionSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSignature, setShowSignature] = useState(false);
  const [signatureResolved, setSignatureResolved] = useState(false);
  const [signatureRecord, setSignatureRecord] = useState<{
    signature_data: string | null;
    signature_status: string;
    signer_name: string | null;
    skip_reason: string | null;
  } | null>(null);
  const [fieldValues, setFieldValues] = useState<InspectionFieldValue[]>([]);
  const [photoCounts, setPhotoCounts] = useState<Record<string, number>>({});
  const [keyFormOpen, setKeyFormOpen] = useState(false);
  const [keyDateInput, setKeyDateInput] = useState<Date | undefined>();
  const [keyTimeInput, setKeyTimeInput] = useState('');
  const [savingKeyCollection, setSavingKeyCollection] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      const [{ data: insp }, { data: secs }, { data: sig }, { data: fvData }, { data: photoData }] = await Promise.all([
        supabase.from('inspections').select('*').eq('id', id!).single(),
        supabase.from('inspection_sections').select('*').eq('inspection_id', id!).eq('is_visible', true).order('sort_order'),
        supabase.from('inspection_signatures').select('signature_data, signature_status, signer_name, skip_reason').eq('inspection_id', id!).order('created_at', { ascending: false }).limit(1),
        supabase.from('inspection_field_values').select('*').eq('inspection_id', id!).in('field_key', ['fecha_recoleccion_llaves', 'hora_recoleccion_llaves']),
        supabase.from('inspection_photos').select('id, inspection_section_id').eq('inspection_id', id!),
      ]);
      let inspObj = insp as unknown as Inspection;
      const secList = (secs ?? []) as unknown as InspectionSection[];
      setSections(secList);
      setFieldValues((fvData ?? []) as unknown as InspectionFieldValue[]);
      const sigRecord = (sig ?? [])[0] ?? null;
      setSignatureRecord(sigRecord as typeof signatureRecord);
      setSignatureResolved(!!sigRecord);

      // Build photo counts per section
      const counts: Record<string, number> = {};
      for (const p of (photoData ?? []) as { id: string; inspection_section_id: string }[]) {
        counts[p.inspection_section_id] = (counts[p.inspection_section_id] ?? 0) + 1;
      }
      setPhotoCounts(counts);

      if (inspObj) {
        const newStatus = await ensureInspectionStatusConsistency(id!);
        if (newStatus && newStatus !== inspObj.status) {
          inspObj = { ...inspObj, status: newStatus as Inspection['status'] };
        }
      }

      setInspection(inspObj);
      setLoading(false);
    };
    fetchData();
    // location.key changes on every navigation (including returning from a sub-route),
    // so signature/section state stays fresh after signing inside the section view.
  }, [id, location.key]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <header className="sticky top-0 z-10 border-b bg-card/80 backdrop-blur-sm">
          <div className="flex h-16 items-center gap-3 px-4">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-5 w-48" />
          </div>
        </header>
        <div className="px-4 py-4 space-y-4">
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  if (!inspection) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Inspección no encontrada</div>;

  const progress = calculateProgress(sections);
  const displayState = getInspectorDisplayState(inspection, progress.completed, progress.total, inspection);
  const allCompleted = progress.completed === progress.total && progress.total > 0;
  const readOnly = isInspectorReadOnly(inspection.status);
  const canSubmit = !readOnly && allCompleted && ['assigned', 'in_progress', 'needs_changes'].includes(inspection.status);

  // Skip introduction and property_data sections (shown as briefing card / intro)
  const workSections = sections.filter(s =>
    s.section_type !== 'reception_meta' &&
    s.section_type !== 'introduction' &&
    s.section_key !== 'property_data' &&
    s.section_key !== 'reception_data'
  );

  // Check photo finalization
  const finalizationResult = canFinalizeInspection(sections, photoCounts);

  // WhatsApp from snapshot
  const snapshot = getEffectiveSnapshot(inspection);
  const tenantWhatsapp = (snapshot?.tenant_whatsapp as string) ?? null;
  const keyDateField = fieldValues.find((f) => f.field_key === 'fecha_recoleccion_llaves');
  const keyTimeField = fieldValues.find((f) => f.field_key === 'hora_recoleccion_llaves');
  const primaryKeyDate = keyDateField?.value_text ?? null;
  const primaryKeyTime = keyTimeField?.value_text ?? null;
  const mirroredKeyDate = (snapshot?.fecha_recoleccion_llaves as string) ?? null;
  const mirroredKeyTime = (snapshot?.hora_recoleccion_llaves as string) ?? null;
  const keyDate = primaryKeyDate ?? mirroredKeyDate;
  const keyTime = primaryKeyTime ?? mirroredKeyTime;
  const keyCollectionCoordinated = Boolean(keyDate);

  // Find a section to anchor key collection saves (introduction or first section)
  const anchorSection = sections.find((s) => s.section_key === 'introduction') ?? sections[0];

  const openWhatsApp = () => {
    if (!tenantWhatsapp) return;
    const cleaned = tenantWhatsapp.replace(/[^+\d]/g, '');
    const msg = encodeURIComponent(`Hola, soy de Homie. Te contacto para coordinar la recolección de llaves de la propiedad${inspection.property_name ? ` ${inspection.property_name}` : ''}.`);
    window.open(`https://wa.me/${cleaned}?text=${msg}`, '_blank');
  };

  const openKeyForm = () => {
    if (keyDate) {
      const parsed = new Date(`${keyDate}T00:00:00`);
      if (!Number.isNaN(parsed.getTime())) setKeyDateInput(parsed);
    }
    setKeyTimeInput(keyTime ?? '');
    setKeyFormOpen(true);
  };

  const saveKeyCollection = async () => {
    if (!inspection || !anchorSection || !keyDateInput) {
      toast({ title: 'Fecha requerida', description: 'Debes seleccionar una fecha para guardar.', variant: 'destructive' });
      return;
    }

    setSavingKeyCollection(true);

    const dateValue = keyDateInput.toISOString().slice(0, 10);
    const timeValue = keyTimeInput.trim() || null;

    const updates: any[] = [];

    if (keyDateField) {
      updates.push(
        supabase
          .from('inspection_field_values')
          .update({ value_text: dateValue, updated_at: new Date().toISOString(), updated_by: profile?.id })
          .eq('id', keyDateField.id)
      );
    } else {
      updates.push(
        supabase.from('inspection_field_values').insert({
          inspection_id: inspection.id,
          inspection_section_id: anchorSection.id,
          field_key: 'fecha_recoleccion_llaves',
          field_label: 'Recolección de llaves / inspección',
          field_type: 'date',
          group_key: 'key_collection',
          value_text: dateValue,
          updated_by: profile?.id,
        })
      );
    }

    if (keyTimeField) {
      updates.push(
        supabase
          .from('inspection_field_values')
          .update({ value_text: timeValue, updated_at: new Date().toISOString(), updated_by: profile?.id })
          .eq('id', keyTimeField.id)
      );
    } else {
      updates.push(
        supabase.from('inspection_field_values').insert({
          inspection_id: inspection.id,
          inspection_section_id: anchorSection.id,
          field_key: 'hora_recoleccion_llaves',
          field_label: 'Hora Recolección de Llaves',
          field_type: 'text',
          group_key: 'key_collection',
          value_text: timeValue,
          updated_by: profile?.id,
        })
      );
    }

    const mergedOverrides = {
      ...(inspection.property_overrides_json ?? {}),
      fecha_recoleccion_llaves: dateValue,
      hora_recoleccion_llaves: timeValue,
    };

    updates.push(
      supabase
        .from('inspections')
        .update({ property_overrides_json: mergedOverrides })
        .eq('id', inspection.id)
    );

    const results = await Promise.all(updates);
    const hasError = results.some((res) => (res as { error?: { message?: string } }).error);

    if (hasError) {
      toast({ title: 'Error al guardar', description: 'No se pudo guardar la recolección de llaves.', variant: 'destructive' });
      setSavingKeyCollection(false);
      return;
    }

    setFieldValues((prev) => {
      const withoutKeys = prev.filter((f) => !['fecha_recoleccion_llaves', 'hora_recoleccion_llaves'].includes(f.field_key));
      const baseDate: InspectionFieldValue = {
        ...(keyDateField ?? {
          id: `temp-fecha-${inspection.id}`,
          inspection_id: inspection.id,
          inspection_section_id: anchorSection.id,
          field_key: 'fecha_recoleccion_llaves',
          field_label: 'Recolección de llaves / inspección',
          field_type: 'date',
          group_key: 'key_collection',
          value_json: null,
          sort_order: 0,
          is_visible: true,
          updated_by: profile?.id ?? null,
          updated_at: new Date().toISOString(),
          value_text: null,
        }),
        value_text: dateValue,
      };
      const baseTime: InspectionFieldValue = {
        ...(keyTimeField ?? {
          id: `temp-hora-${inspection.id}`,
          inspection_id: inspection.id,
          inspection_section_id: anchorSection.id,
          field_key: 'hora_recoleccion_llaves',
          field_label: 'Hora Recolección de Llaves',
          field_type: 'text',
          group_key: 'key_collection',
          value_json: null,
          sort_order: 1,
          is_visible: true,
          updated_by: profile?.id ?? null,
          updated_at: new Date().toISOString(),
          value_text: null,
        }),
        value_text: timeValue,
      };
      return [...withoutKeys, baseDate, baseTime];
    });

    setInspection({ ...inspection, property_overrides_json: mergedOverrides });
    setSavingKeyCollection(false);
    setKeyFormOpen(false);
    toast({ title: 'Recolección guardada', description: 'La fecha/hora quedó registrada para esta inspección.' });

    // Outbound HubSpot sync — awaited so failures are visible (still non-blocking for the save).
    const syncRes = await triggerKeyCollectionSync(inspection.id);
    if (!syncRes.ok) {
      toast({
        title: 'Sync HubSpot pendiente',
        description: 'La fecha se guardó pero no se pudo enviar a HubSpot. Revisa los logs salientes.',
        variant: 'destructive',
      });
    }
  };

  const PRE_WORK_STATUSES = ['assigned', 'pending', 'pending_assignment'];
  const notStartedYet = PRE_WORK_STATUSES.includes(inspection.status) && !inspection.started_at;
  const blockStart = notStartedYet && !keyCollectionCoordinated;

  const handleStart = async () => {
    if (blockStart) {
      toast({
        title: 'Fecha de recolección requerida',
        description: 'Debes cargar la fecha de recolección de llaves antes de iniciar la inspección.',
        variant: 'destructive',
      });
      openKeyForm();
      return;
    }
    if (PRE_WORK_STATUSES.includes(inspection.status)) {
      await supabase
        .from('inspections')
        .update({ status: 'in_progress', started_at: new Date().toISOString() })
        .eq('id', inspection.id);
      setInspection({ ...inspection, status: 'in_progress' });
    }
    const firstIncomplete = workSections.find((s) => s.status !== 'completed' && s.status !== 'reviewed');
    if (firstIncomplete) {
      navigate(`/inspector/inspection/${inspection.id}/section/${firstIncomplete.id}`);
    } else if (workSections.length > 0) {
      navigate(`/inspector/inspection/${inspection.id}/section/${workSections[0].id}`);
    }
  };

  const handleSignatureConfirm = async (data: {
    signature_data: string | null;
    signature_status: 'signed' | 'refused' | 'unavailable';
    signer_name: string;
    skip_reason: string | null;
  }) => {
    await supabase.from('inspection_signatures').delete().eq('inspection_id', inspection!.id);
    await supabase.from('inspection_signatures').insert({
      inspection_id: inspection!.id,
      signer_name: data.signer_name || null,
      signature_data: data.signature_data,
      signature_status: data.signature_status,
      skip_reason: data.skip_reason,
      created_by: profile?.id,
    });
    setShowSignature(false);
    setSignatureResolved(true);
    setSignatureRecord({
      signature_data: data.signature_data,
      signature_status: data.signature_status,
      signer_name: data.signer_name || null,
      skip_reason: data.skip_reason,
    });
  };

  const doSubmit = async () => {
    // Final photo validation
    if (!finalizationResult.valid) {
      toast({
        title: 'Fotos requeridas para enviar',
        description: finalizationResult.missingLabels.map((l) => `Faltan fotos en ${l}`).join(' · '),
        variant: 'destructive',
      });
      return;
    }

    await ensureInspectionStatusConsistency(inspection!.id);
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('inspections')
      .update({
        status: 'submitted',
        current_stage: 'review',
        inspection_completed_at: now,
        completed_at: now,
        submitted_by: profile?.id,
      })
      .eq('id', inspection!.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      // Outbound HubSpot sync — transition-gated, same canonical timestamp as inspection_completed_at.
      const syncRes = await syncCheckoutIfApplicable({
        inspectionId: inspection!.id,
        previousStatus: inspection!.status,
        newStatus: 'submitted',
        eventTimeIso: now,
      });
      if (syncRes && !syncRes.ok) {
        toast({
          title: 'Sync HubSpot pendiente',
          description: 'La inspección se envió pero el checkout no llegó a HubSpot. Revisa los logs salientes.',
          variant: 'destructive',
        });
      } else {
        toast({ title: 'Inspección enviada', description: 'Enviada para revisión del ejecutivo asignado' });
      }
      navigate('/inspector');
    }
  };

  const handleOpenSignature = () => {
    setShowSignature(true);
  };

  return (
    <div className="min-h-screen bg-muted/30 pb-28">
      <header className="sticky top-0 z-10 border-b bg-card/80 backdrop-blur-sm">
        <div className="flex h-14 items-center gap-3 px-4">
          <Button variant="ghost" size="icon" className="rounded-xl" onClick={() => navigate('/inspector')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <p className="font-semibold text-sm truncate">{inspection.property_name ?? inspection.property_id}</p>
            <InspectorStatusBadge state={displayState} />
          </div>
          {tenantWhatsapp && (
            <Button
              variant="ghost"
              size="icon"
              className="rounded-xl text-[hsl(var(--status-good))]"
              onClick={() => {
                const cleaned = tenantWhatsapp.replace(/[^+\d]/g, '');
                const msg = encodeURIComponent(`Hola, soy de Homie. Te contacto para coordinar el checkout de la propiedad${inspection.property_name ? ` ${inspection.property_name}` : ''}.`);
                window.open(`https://wa.me/${cleaned}?text=${msg}`, '_blank');
              }}
            >
              <MessageCircle className="h-4 w-4" />
            </Button>
          )}
        </div>
      </header>

      <main className="px-4 py-4 space-y-6">
        {/* Signature step overlay */}
        {showSignature && (
          <div className="fixed inset-0 z-50 bg-background/95 overflow-y-auto p-4 pt-16">
            <div className="max-w-md mx-auto">
              <SignaturePad
                onConfirm={handleSignatureConfirm}
                onCancel={() => setShowSignature(false)}
              />
            </div>
          </div>
        )}
        {/* Read-only banner (post-submission) */}
        {readOnly && (
          <Card className="border-0 shadow-sm rounded-3xl bg-muted/40 ring-1 ring-border">
            <CardContent className="p-4 flex items-center gap-3">
              <Lock className="h-4 w-4 text-muted-foreground" />
              <div className="text-sm">
                <p className="font-semibold">Inspección enviada — solo lectura</p>
                <p className="text-xs text-muted-foreground">No es posible editar respuestas, fotos ni firma desde aquí.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Property Briefing Card — read-only payload data */}
        <PropertyBriefingCard inspection={inspection} />

        {/* Progress */}
        <Card className="border-0 shadow-sm rounded-3xl bg-card">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Progreso</span>
              <span className="text-xs text-muted-foreground font-semibold">{progress.percent}%</span>
            </div>
            <Progress value={progress.percent} className={cn("h-3 rounded-full", progress.percent === 100 && "[&>div]:bg-[hsl(var(--status-good))]")} />
            <p className="text-xs text-muted-foreground mt-2">{progress.completed} de {progress.total} secciones</p>
            {!readOnly && !allCompleted && (
              <p className="text-[10px] text-muted-foreground mt-1">Completa todas las secciones antes de enviar</p>
            )}
            {/* Photo finalization warning — detailed list */}
            {!readOnly && allCompleted && !finalizationResult.valid && (
              <div className="mt-2 text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/30 rounded-xl px-3 py-2 space-y-1">
                <div className="flex items-center gap-2 font-medium">
                  <Camera className="h-3.5 w-3.5 shrink-0" />
                  <span>Fotos requeridas para enviar:</span>
                </div>
                <ul className="list-disc list-inside space-y-0.5 pl-1">
                  {finalizationResult.missingLabels.map((label) => (
                    <li key={label}>Faltan fotos en {label}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recolección de llaves (hidden in read-only mode) */}
        {!readOnly && (
          <Card className="border-0 shadow-sm rounded-3xl bg-card ring-1 ring-border">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Recolección de llaves</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {keyCollectionCoordinated ? 'Coordinada' : 'Pendiente de coordinar'}
                  </p>
                </div>
                <span className={cn(
                  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                  keyCollectionCoordinated ? 'bg-status-good-bg text-status-good' : 'bg-status-bad-bg text-status-bad'
                )}>
                  {keyCollectionCoordinated ? 'Coordinada' : 'Pendiente'}
                </span>
              </div>

              {keyCollectionCoordinated ? (
                <div className="rounded-2xl bg-muted/40 px-3.5 py-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <CalendarClock className="h-4 w-4 shrink-0" />
                  <span>
                    {new Date(`${keyDate}T00:00:00`).toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                    {keyTime ? ` · ${keyTime}` : ''}
                  </span>
                </div>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">Primero coordina con el inquilino y luego registra fecha/hora acordada.</p>
                  {(() => {
                    const contractEndDate = (snapshot?.fecha_de_termino_real_de_contrato as string) ?? null;
                    if (!contractEndDate) return null;
                    const dt = new Date(`${contractEndDate}T00:00:00`);
                    if (Number.isNaN(dt.getTime())) return null;
                    return (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-xl px-3 py-2">
                        <Clock className="h-3.5 w-3.5 shrink-0" />
                        <span>Contrato termina: {dt.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                      </div>
                    );
                  })()}
                </>
              )}

              <div className="flex flex-col sm:flex-row gap-2">
                {tenantWhatsapp && (
                  <Button variant="outline" className="flex-1 h-10 rounded-xl gap-2" onClick={openWhatsApp}>
                    <MessageCircle className="h-4 w-4" /> Contactar por WhatsApp
                  </Button>
                )}
                <Button className="flex-1 h-10 rounded-xl gap-2" onClick={openKeyForm}>
                  {keyCollectionCoordinated ? <Edit3 className="h-4 w-4" /> : <CalendarClock className="h-4 w-4" />}
                  {keyCollectionCoordinated ? 'Editar' : 'Cargar fecha'}
                </Button>
              </div>

              {keyFormOpen && (
                <div className="space-y-3 rounded-2xl border border-border p-3.5">
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Fecha de recolección</p>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start text-left font-normal rounded-xl">
                          {keyDateInput
                            ? keyDateInput.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })
                            : 'Seleccionar fecha'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={keyDateInput}
                          onSelect={setKeyDateInput}
                          initialFocus
                          className={cn('p-3 pointer-events-auto')}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Hora (opcional)</p>
                    <Input
                      type="time"
                      value={keyTimeInput}
                      onChange={(e) => setKeyTimeInput(e.target.value)}
                      className="rounded-xl"
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setKeyFormOpen(false)}>
                      Cancelar
                    </Button>
                    <Button className="flex-1 rounded-xl" onClick={saveKeyCollection} disabled={savingKeyCollection}>
                      {savingKeyCollection ? 'Guardando...' : 'Guardar'}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Persistent Signature card — visible at all times once signature exists */}
        {signatureResolved && signatureRecord && (
          <Card className="border-0 shadow-sm rounded-3xl bg-card ring-1 ring-border">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Firma del Inquilino</p>
                {signatureRecord.signature_status === 'signed' ? (
                  <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-status-good-bg text-status-good">
                    Firmada
                  </span>
                ) : signatureRecord.signature_status === 'refused' ? (
                  <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-status-bad-bg text-status-bad">
                    Inquilino se negó a firmar
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-muted text-muted-foreground">
                    Inquilino no disponible
                  </span>
                )}
              </div>
              {signatureRecord.signer_name && (
                <p className="text-xs text-muted-foreground">Firmó: {signatureRecord.signer_name}</p>
              )}
              {signatureRecord.signature_data && (
                <div className="rounded-2xl border border-border bg-background p-3 flex justify-center">
                  <img
                    src={signatureRecord.signature_data}
                    alt="Firma del inquilino"
                    className="max-h-32 object-contain"
                  />
                </div>
              )}
              {signatureRecord.skip_reason && (
                <p className="text-xs text-muted-foreground italic">Motivo: {signatureRecord.skip_reason}</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Signature prompt when all complete but not signed (hidden in read-only) */}
        {!readOnly && allCompleted && canSubmit && !signatureResolved && (
          <Card className="border-0 shadow-md rounded-3xl bg-primary/5 ring-1 ring-primary/20">
            <CardContent className="p-5 text-center space-y-3">
              <CheckCircle2 className="h-8 w-8 mx-auto text-primary" />
              <div>
                <p className="text-sm font-semibold">Inspección completada</p>
                <p className="text-xs text-muted-foreground mt-1">Obtén la firma del inquilino para poder enviar la inspección</p>
              </div>
              <Button onClick={handleOpenSignature} className="rounded-2xl h-11 w-full">
                Firma del inquilino
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Secciones · {workSections.length} pasos</h3>
          {workSections.map((section, idx) => {
            const isCompleted = isSectionCompleted(section.status);
            const isCurrent = !readOnly && !isCompleted && (idx === 0 || workSections.slice(0, idx).every(s => isSectionCompleted(s.status)));
            return (
              <button
                key={section.id}
                onClick={() => navigate(`/inspector/inspection/${inspection.id}/section/${section.id}`)}
                className="w-full text-left"
              >
                <Card className={cn(
                  'border-0 ring-1 shadow-sm transition-all rounded-2xl',
                  !readOnly && 'active:scale-[0.99]',
                  isCurrent ? 'ring-primary/30 bg-primary/[0.03] shadow-md' : 'ring-border'
                )}>
                  <CardContent className="p-3.5 flex items-center gap-3 min-h-[56px]">
                    <div className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-xl text-xs font-bold shrink-0',
                      isCompleted ? 'bg-status-good-bg text-status-good' :
                      isCurrent ? 'bg-primary text-primary-foreground' :
                      'bg-muted text-muted-foreground'
                    )}>
                      {isCompleted ? <CheckCircle2 className="h-4.5 w-4.5" /> : idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn('font-medium text-sm', isCurrent && 'text-primary')}>{section.section_title}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {readOnly ? 'Solo lectura' : isCurrent ? 'Siguiente sección' : section.section_type.replace(/_/g, ' ')}
                      </p>
                    </div>
                    <SectionStatusBadge status={section.status} />
                  </CardContent>
                </Card>
              </button>
            );
          })}
        </div>
      </main>

      {/* Sticky bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-card/90 backdrop-blur-sm border-t">
        {readOnly ? (
          <div className="flex items-center justify-center gap-2 h-12 rounded-xl bg-muted/40 text-sm text-muted-foreground font-medium">
            <Lock className="h-4 w-4" /> Inspección enviada — solo lectura
          </div>
        ) : allCompleted && canSubmit && signatureResolved ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button className="w-full h-12 rounded-xl text-body bg-[hsl(var(--status-good))] hover:bg-[hsl(var(--status-good))]/90" size="lg">
                <Send className="mr-2 h-5 w-5" /> Revisar y enviar
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Enviar inspección?</AlertDialogTitle>
                <AlertDialogDescription>
                  Una vez enviada, la inspección pasará al ejecutivo asignado para su revisión y no podrás editarla.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={doSubmit}>Enviar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : allCompleted && canSubmit && !signatureResolved ? (
          <Button onClick={handleOpenSignature} className="w-full h-12 rounded-xl text-body" size="lg" variant="default">
            <CheckCircle2 className="mr-2 h-5 w-5" /> Firma del inquilino
          </Button>
        ) : (
          <div className="space-y-2">
            {blockStart && (
              <p className="text-[11px] text-center text-amber-700 bg-amber-50 dark:bg-amber-950/30 rounded-lg px-3 py-1.5">
                Carga la fecha de recolección de llaves para iniciar.
              </p>
            )}
            <Button
              onClick={handleStart}
              className="w-full h-12 rounded-xl text-body"
              size="lg"
              disabled={blockStart}
            >
              <ArrowRight className="mr-2 h-5 w-5" />
              {notStartedYet ? 'Iniciar Inspección' : 'Continuar Inspección'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
