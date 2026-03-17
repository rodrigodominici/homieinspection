import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { InspectionStatusBadge, SectionStatusBadge } from '@/components/StatusBadge';
import { useToast } from '@/hooks/use-toast';
import { calculateProgress } from '@/lib/inspection-utils';
import type { Inspection, InspectionSection } from '@/lib/types';
import { ArrowLeft, MapPin, Building, CheckCircle2 } from 'lucide-react';

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
      setInspection(insp as unknown as Inspection);

      const { data: secs } = await supabase
        .from('inspection_sections')
        .select('*')
        .eq('inspection_id', id!)
        .eq('is_visible', true)
        .order('sort_order');
      setSections((secs ?? []) as unknown as InspectionSection[]);
      setLoading(false);
    };
    fetch();
  }, [id]);

  if (loading) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Cargando...</div>;
  if (!inspection) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Inspección no encontrada</div>;

  const progress = calculateProgress(sections);
  const allCompleted = progress.completed === progress.total && progress.total > 0;
  const canSubmit = allCompleted && ['assigned', 'in_progress', 'needs_changes'].includes(inspection.status);

  const handleStart = async () => {
    if (inspection.status === 'assigned') {
      await supabase
        .from('inspections')
        .update({ status: 'in_progress', started_at: new Date().toISOString() })
        .eq('id', inspection.id);
      setInspection({ ...inspection, status: 'in_progress' });
    }
    const firstIncomplete = sections.find((s) => s.status !== 'completed' && s.status !== 'reviewed');
    if (firstIncomplete) {
      navigate(`/inspector/inspection/${inspection.id}/section/${firstIncomplete.id}`);
    } else if (sections.length > 0) {
      navigate(`/inspector/inspection/${inspection.id}/section/${sections[0].id}`);
    }
  };

  /**
   * HANDOFF LOGIC:
   * When the inspector submits, the inspection status changes to 'submitted'.
   * Because executive_id was set at creation time, the executive's RLS policy
   * (executive_id = auth.uid()) will now include this inspection in their
   * SELECT queries. The executive dashboard filters for status='submitted'
   * or 'in_review', so the inspection appears in their review queue automatically.
   */
  const handleSubmit = async () => {
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

  const snapshot = inspection.property_snapshot_json as Record<string, unknown>;

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-10 border-b bg-card/80 backdrop-blur-sm">
        <div className="flex h-16 items-center gap-3 px-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/inspector')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">{inspection.property_name ?? inspection.property_id}</p>
            <div className="flex items-center gap-2">
              <InspectionStatusBadge status={inspection.status} />
            </div>
          </div>
        </div>
      </header>

      <main className="px-4 py-4 space-y-4">
        <Card className="border-0 ring-1 ring-border/50 shadow-sm">
          <CardContent className="py-4 space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" />
              <span>{inspection.address ?? 'Sin dirección'}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Building className="h-4 w-4" />
              <span>{inspection.typology} · {inspection.property_type} · {inspection.inspection_type}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 ring-1 ring-border/50 shadow-sm">
          <CardContent className="py-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Progreso</span>
              <span className="text-sm text-muted-foreground">{progress.completed} de {progress.total}</span>
            </div>
            <Progress value={progress.percent} className="h-3" />
            <p className="text-right text-xs text-muted-foreground mt-1">{progress.percent}%</p>
          </CardContent>
        </Card>

        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Secciones</h3>
          {sections.map((section, idx) => (
            <button
              key={section.id}
              onClick={() => navigate(`/inspector/inspection/${inspection.id}/section/${section.id}`)}
              className="w-full text-left"
            >
              <Card className="border-0 ring-1 ring-border/50 shadow-sm hover:shadow-md transition-shadow active:scale-[0.99]">
                <CardContent className="py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-sm font-medium">
                      {idx + 1}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{section.section_title}</p>
                      <p className="text-xs text-muted-foreground capitalize">{section.section_type.replace('_', ' ')}</p>
                    </div>
                  </div>
                  <SectionStatusBadge status={section.status} />
                </CardContent>
              </Card>
            </button>
          ))}
        </div>
      </main>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-card/90 backdrop-blur-sm border-t">
        {canSubmit ? (
          <Button onClick={handleSubmit} className="w-full h-12" size="lg">
            <CheckCircle2 className="mr-2 h-5 w-5" /> Enviar para Revisión
          </Button>
        ) : (
          <Button onClick={handleStart} className="w-full h-12" size="lg">
            {inspection.status === 'assigned' ? 'Iniciar Inspección' : 'Continuar Inspección'}
          </Button>
        )}
      </div>
    </div>
  );
}
