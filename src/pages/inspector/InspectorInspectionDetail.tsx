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
import PropertyBriefingCard from '@/components/PropertyBriefingCard';
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
import type { Inspection, InspectionSection } from '@/lib/types';
import { ArrowLeft, ArrowRight, Send, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function InspectorInspectionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { toast } = useToast();
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [sections, setSections] = useState<InspectionSection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data: insp } = await supabase
        .from('inspections')
        .select('*')
        .eq('id', id!)
        .single();
      let inspObj = insp as unknown as Inspection;

      const { data: secs } = await supabase
        .from('inspection_sections')
        .select('*')
        .eq('inspection_id', id!)
        .eq('is_visible', true)
        .order('sort_order');
      const secList = (secs ?? []) as unknown as InspectionSection[];
      setSections(secList);

      if (inspObj) {
        const newStatus = await ensureInspectionStatusConsistency(id!);
        if (newStatus && newStatus !== inspObj.status) {
          inspObj = { ...inspObj, status: newStatus as Inspection['status'] };
        }
      }

      setInspection(inspObj);
      setLoading(false);
    };
    fetch();
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

  const handleSubmit = async () => {
    await ensureInspectionStatusConsistency(inspection.id);
    const { error } = await supabase
      .from('inspections')
      .update({
        status: 'submitted',
        completed_at: new Date().toISOString(),
        submitted_by: profile?.id,
      })
      .eq('id', inspection.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Inspección enviada', description: 'Enviada para revisión del ejecutivo asignado' });
      navigate('/inspector');
    }
  };

  return (
    <div className="min-h-screen bg-background pb-28">
      <header className="sticky top-0 z-10 border-b bg-card/80 backdrop-blur-sm">
        <div className="flex h-16 items-center gap-3 px-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/inspector')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">{inspection.property_name ?? inspection.property_id}</p>
          </div>
        </div>
      </header>

      <main className="px-4 py-4 space-y-4">
        {/* Property Briefing Card — read-only payload data */}
        <PropertyBriefingCard inspection={inspection} />

        {/* Progress */}
        <Card className="border-0 ring-1 ring-border shadow-sm rounded-2xl">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-body font-medium">Progreso</span>
              <span className="text-caption text-muted-foreground">{progress.completed} de {progress.total}</span>
            </div>
            <Progress value={progress.percent} className={cn("h-3 rounded-full", progress.percent === 100 && "[>div]:bg-[hsl(var(--status-good))]")} />
            <p className={cn("text-right text-tiny mt-1", progress.percent === 100 ? "text-status-good font-semibold" : "text-muted-foreground")}>{progress.percent}%</p>
            {!allCompleted && (
              <p className="text-tiny text-muted-foreground mt-2">Completa todas las secciones antes de enviar</p>
            )}
          </CardContent>
        </Card>

        {/* Guided section list */}
        <div className="space-y-2">
          <h3 className="text-caption font-medium text-muted-foreground uppercase tracking-wider">Secciones · {workSections.length} pasos</h3>
          {workSections.map((section, idx) => {
            const isCompleted = section.status === 'completed' || section.status === 'reviewed';
            const isCurrent = !isCompleted && (idx === 0 || workSections.slice(0, idx).every(s => s.status === 'completed' || s.status === 'reviewed'));
            return (
              <button
                key={section.id}
                onClick={() => navigate(`/inspector/inspection/${inspection.id}/section/${section.id}`)}
                className="w-full text-left"
              >
                <Card className={cn(
                  'border-0 ring-1 shadow-sm hover:shadow-md transition-all active:scale-[0.99] rounded-2xl',
                  isCurrent ? 'ring-primary/40 bg-primary/[0.02]' : 'ring-border'
                )}>
                  <CardContent className="p-3 flex items-center gap-3">
                    {/* Step number */}
                    <div className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-xl text-caption font-bold shrink-0 transition-colors',
                      isCompleted ? 'bg-status-good-bg text-status-good' :
                      isCurrent ? 'bg-primary text-primary-foreground' :
                      'bg-muted text-muted-foreground'
                    )}>
                      {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn('font-medium text-body', isCurrent && 'text-primary')}>{section.section_title}</p>
                      <p className="text-tiny text-muted-foreground">
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

      {/* Sticky bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-card/90 backdrop-blur-sm border-t">
        <div className="space-y-2">
          <Button onClick={handleStart} className="w-full h-12 rounded-xl text-body" size="lg">
            <ArrowRight className="mr-2 h-5 w-5" />
            {inspection.status === 'assigned' ? 'Iniciar Inspección' : 'Continuar Inspección'}
          </Button>

          {canSubmit && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="w-full h-10 rounded-xl text-caption" size="sm">
                  <Send className="mr-2 h-4 w-4" /> Enviar para Revisión
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
                  <AlertDialogAction onClick={handleSubmit}>Enviar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>
    </div>
  );
}
