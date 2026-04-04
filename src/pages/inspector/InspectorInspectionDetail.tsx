import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
import { ensureInspectionStatusConsistency } from '@/lib/inspection-status-guard';
import { isSectionCompleted } from '@/lib/section-completion';
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
import type { Inspection, InspectionFieldValue, InspectionSection } from '@/lib/types';
import { ArrowLeft, ArrowRight, Send, CheckCircle2, MessageCircle, CalendarClock, Edit3, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getInspectorDisplayState } from '@/lib/inspector-operational';

export default function InspectorInspectionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { toast } = useToast();
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [sections, setSections] = useState<InspectionSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSignature, setShowSignature] = useState(false);
  const [signatureResolved, setSignatureResolved] = useState(false);
  const [fieldValues, setFieldValues] = useState<InspectionFieldValue[]>([]);
  const [keyFormOpen, setKeyFormOpen] = useState(false);
  const [keyDateInput, setKeyDateInput] = useState<Date | undefined>();
  const [keyTimeInput, setKeyTimeInput] = useState('');
  const [savingKeyCollection, setSavingKeyCollection] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      const [{ data: insp }, { data: secs }, { data: sig }, { data: fvData }] = await Promise.all([
        supabase.from('inspections').select('*').eq('id', id!).single(),
        supabase.from('inspection_sections').select('*').eq('inspection_id', id!).eq('is_visible', true).order('sort_order'),
        supabase.from('inspection_signatures').select('id').eq('inspection_id', id!).limit(1),
        supabase.from('inspection_field_values').select('*').eq('inspection_id', id!).in('field_key', ['fecha_recoleccion_llaves', 'hora_recoleccion_llaves']),
      ]);
      let inspObj = insp as unknown as Inspection;
      const secList = (secs ?? []) as unknown as InspectionSection[];
      setSections(secList);
      setFieldValues((fvData ?? []) as unknown as InspectionFieldValue[]);
      setSignatureResolved((sig ?? []).length > 0);

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
  }, [id]);

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
  const canSubmit = allCompleted && ['assigned', 'in_progress', 'needs_changes'].includes(inspection.status);

  // Skip reception_data / property_data section (shown as briefing card)
  const workSections = sections.filter(s => s.section_key !== 'property_data' && s.section_key !== 'reception_data');

  // R4: WhatsApp from snapshot
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

  const closingSection = sections.find((s) => s.section_key === 'closing');

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
    if (!inspection || !closingSection || !keyDateInput) {
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
          inspection_section_id: closingSection.id,
          field_key: 'fecha_recoleccion_llaves',
          field_label: 'Fecha Recolección de Llaves',
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
          inspection_section_id: closingSection.id,
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
          inspection_section_id: closingSection.id,
          field_key: 'fecha_recoleccion_llaves',
          field_label: 'Fecha Recolección de Llaves',
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
          inspection_section_id: closingSection.id,
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
  };

  const handleStart = async () => {
    if (inspection.status === 'assigned') {
      await supabase
        .from('inspections')
        .update({ status: 'in_progress', started_at: new Date().toISOString() })
        .eq('id', inspection.id);
      setInspection({ ...inspection, status: 'in_progress' });
    }
    // Skip to first non-property-data incomplete section
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
    // Delete previous signature if exists (one active per inspection)
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
  };

  const doSubmit = async () => {
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
      toast({ title: 'Inspección enviada', description: 'Enviada para revisión del ejecutivo asignado' });
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
            {!allCompleted && (
              <p className="text-[10px] text-muted-foreground mt-1">Completa todas las secciones antes de enviar</p>
            )}
          </CardContent>
        </Card>

        {/* Recolección de llaves (fuente primaria: field values; espejo: overrides) */}
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

        {/* Guided section list */}
        {/* Signature prompt when all complete but not signed */}
        {allCompleted && canSubmit && !signatureResolved && (
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
            const isCurrent = !isCompleted && (idx === 0 || workSections.slice(0, idx).every(s => isSectionCompleted(s.status)));
            return (
              <button
                key={section.id}
                onClick={() => navigate(`/inspector/inspection/${inspection.id}/section/${section.id}`)}
                className="w-full text-left"
              >
                <Card className={cn(
                  'border-0 ring-1 shadow-sm active:scale-[0.99] transition-all rounded-2xl',
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
                        {isCurrent ? 'Siguiente sección' : section.section_type.replace('_', ' ')}
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

      {/* Sticky bottom bar — 3 states */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-card/90 backdrop-blur-sm border-t">
        {allCompleted && canSubmit && signatureResolved ? (
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
                  Una vez enviada, la inspección pasará al ejecutivo asignado para su revisión.
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
          <Button onClick={handleStart} className="w-full h-12 rounded-xl text-body" size="lg">
              <ArrowRight className="mr-2 h-5 w-5" />
              {displayState.key === 'assigned' ? 'Iniciar Inspección' : 'Continuar Inspección'}
          </Button>
        )}
      </div>
    </div>
  );
}
