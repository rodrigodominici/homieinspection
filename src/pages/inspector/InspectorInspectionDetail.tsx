import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { SectionStatusBadge } from '@/components/StatusBadge';
import { Skeleton } from '@/components/ui/skeleton';
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
import type { Inspection, InspectionSection } from '@/lib/types';
import { ArrowLeft, ArrowRight, Send, CheckCircle2, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

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

  useEffect(() => {
    const fetchData = async () => {
      const [{ data: insp }, { data: secs }, { data: sig }] = await Promise.all([
        supabase.from('inspections').select('*').eq('id', id!).single(),
        supabase.from('inspection_sections').select('*').eq('inspection_id', id!).eq('is_visible', true).order('sort_order'),
        supabase.from('inspection_signatures').select('id').eq('inspection_id', id!).limit(1),
      ]);
      let inspObj = insp as unknown as Inspection;
      const secList = (secs ?? []) as unknown as InspectionSection[];
      setSections(secList);
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
  const allCompleted = progress.completed === progress.total && progress.total > 0;
  const canSubmit = allCompleted && ['assigned', 'in_progress', 'needs_changes'].includes(inspection.status);

  // Skip property_data section (it's shown as briefing card)
  const workSections = sections.filter(s => s.section_key !== 'property_data');

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
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">{inspection.property_name ?? inspection.property_id}</p>
          </div>
        </div>
      </header>

      <main className="px-4 py-4 space-y-4">
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

        <div className="space-y-2.5">
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
            {inspection.status === 'assigned' ? 'Iniciar Inspección' : 'Continuar Inspección'}
          </Button>
        )}
      </div>
    </div>
  );
}
