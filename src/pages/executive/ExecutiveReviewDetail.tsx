import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { InspectionStatusBadge, SectionStatusBadge } from '@/components/StatusBadge';
import { useToast } from '@/hooks/use-toast';
import { calculateProgress } from '@/lib/inspection-utils';
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
import type { Inspection, InspectionSection, InspectionFieldValue, InspectionPhoto } from '@/lib/types';
import { ArrowLeft, CheckCircle2, RotateCcw, MapPin, Building } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ExecutiveReviewDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { toast } = useToast();

  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [sections, setSections] = useState<InspectionSection[]>([]);
  const [fieldsBySection, setFieldsBySection] = useState<Record<string, InspectionFieldValue[]>>({});
  const [photosBySection, setPhotosBySection] = useState<Record<string, InspectionPhoto[]>>({});
  const [loading, setLoading] = useState(true);
  const [returnMode, setReturnMode] = useState(false);
  const [returnComments, setReturnComments] = useState<Record<string, string>>({});
  const [selectedReturnSections, setSelectedReturnSections] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      const { data: insp } = await supabase.from('inspections').select('*').eq('id', id!).single();
      setInspection(insp as unknown as Inspection);

      const { data: secs } = await supabase
        .from('inspection_sections').select('*').eq('inspection_id', id!).eq('is_visible', true).order('sort_order');
      const secList = (secs ?? []) as unknown as InspectionSection[];
      setSections(secList);

      const secIds = secList.map((s) => s.id);
      if (secIds.length > 0) {
        const { data: fields } = await supabase
          .from('inspection_field_values').select('*').in('inspection_section_id', secIds).order('sort_order');
        const fMap: Record<string, InspectionFieldValue[]> = {};
        for (const f of (fields ?? []) as unknown as InspectionFieldValue[]) {
          if (!fMap[f.inspection_section_id]) fMap[f.inspection_section_id] = [];
          fMap[f.inspection_section_id].push(f);
        }
        setFieldsBySection(fMap);

        const { data: photos } = await supabase
          .from('inspection_photos').select('*').in('inspection_section_id', secIds).order('sort_order');
        const pMap: Record<string, InspectionPhoto[]> = {};
        for (const p of (photos ?? []) as unknown as InspectionPhoto[]) {
          if (!pMap[p.inspection_section_id]) pMap[p.inspection_section_id] = [];
          pMap[p.inspection_section_id].push(p);
        }
        setPhotosBySection(pMap);
      }

      if (insp && (insp as unknown as Inspection).status === 'submitted') {
        await supabase.from('inspections').update({ status: 'in_review' }).eq('id', id!);
      }

      setLoading(false);
    };
    fetch();
  }, [id]);

  const handleApprove = async () => {
    setSubmitting(true);
    const { error } = await supabase
      .from('inspections')
      .update({ status: 'approved', approved_at: new Date().toISOString(), approved_by: profile?.id })
      .eq('id', id!);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      await supabase
        .from('inspection_sections')
        .update({ status: 'reviewed', reviewed_by: profile?.id, reviewed_at: new Date().toISOString() })
        .eq('inspection_id', id!);
      toast({ title: 'Inspección aprobada' });
      navigate('/executive');
    }
    setSubmitting(false);
  };

  const handleReturnForChanges = async () => {
    if (selectedReturnSections.size === 0) {
      toast({ title: 'Selecciona al menos una sección', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    for (const secId of selectedReturnSections) {
      const comment = returnComments[secId];
      if (comment?.trim()) {
        await supabase.from('inspection_reviews').insert({
          inspection_id: id!,
          inspection_section_id: secId,
          comment_type: 'revision_request',
          comment: comment.trim(),
          created_by: profile?.id,
        });
      }
      await supabase.from('inspection_sections').update({ status: 'needs_changes' }).eq('id', secId);
    }
    await supabase.from('inspections').update({ status: 'needs_changes' }).eq('id', id!);
    toast({ title: 'Devuelta para cambios' });
    navigate('/executive');
    setSubmitting(false);
  };

  const toggleReturnSection = (secId: string) => {
    setSelectedReturnSections((prev) => {
      const next = new Set(prev);
      if (next.has(secId)) next.delete(secId);
      else next.add(secId);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-10 border-b bg-card/80 backdrop-blur-sm">
          <div className="container flex h-16 items-center gap-4">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-5 w-48" />
          </div>
        </header>
        <div className="container max-w-6xl py-6 space-y-4">
          <Skeleton className="h-24 rounded-xl" />
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (!inspection) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Inspección no encontrada</div>;

  const progress = calculateProgress(sections);

  const statusLabel = (value: string | null) => {
    if (!value) return null;
    const labels: Record<string, { text: string; className: string }> = {
      bueno: { text: 'Bueno', className: 'text-status-good' },
      regular: { text: 'Regular', className: 'text-status-regular' },
      malo: { text: 'Malo', className: 'text-status-bad font-semibold' },
      no_aplica: { text: 'No Aplica', className: 'text-status-na' },
    };
    return labels[value] ?? { text: value, className: '' };
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-10 border-b bg-card/80 backdrop-blur-sm">
        <div className="container flex h-16 items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/executive')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">{inspection.property_name ?? inspection.property_id}</p>
            <InspectionStatusBadge status={inspection.status} />
          </div>
        </div>
      </header>

      <div className="container max-w-6xl py-6">
        {/* Two-column layout on desktop */}
        <div className="lg:grid lg:grid-cols-[320px_1fr] lg:gap-6">
          {/* Left sticky summary */}
          <aside className="hidden lg:block">
            <div className="sticky top-24 space-y-4">
              <Card className="border-0 ring-1 ring-border shadow-sm">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2 text-caption">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span>{inspection.address}</span>
                  </div>
                  <div className="flex items-center gap-2 text-caption">
                    <Building className="h-4 w-4 text-muted-foreground" />
                    <span>{inspection.typology} · {inspection.property_type}</span>
                  </div>
                  <div className="border-t pt-3">
                    <p className="text-caption text-muted-foreground mb-1">Progreso</p>
                    <p className="text-h4 font-bold">{progress.percent}%</p>
                    <p className="text-tiny text-muted-foreground">{progress.completed} de {progress.total} secciones</p>
                  </div>
                </CardContent>
              </Card>

              {/* Section nav */}
              <Card className="border-0 ring-1 ring-border shadow-sm">
                <CardContent className="p-4">
                  <p className="text-caption font-medium text-muted-foreground mb-2">Secciones</p>
                  <div className="space-y-1 max-h-[400px] overflow-y-auto">
                    {sections.map((s) => (
                      <a
                        key={s.id}
                        href={`#section-${s.id}`}
                        className="flex items-center justify-between py-1.5 px-2 rounded-lg text-caption hover:bg-muted/50 transition-colors"
                      >
                        <span className="truncate">{s.section_title}</span>
                        <SectionStatusBadge status={s.status} />
                      </a>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </aside>

          {/* Right scrollable review feed */}
          <div className="space-y-4">
            {/* Mobile-only summary */}
            <Card className="border-0 ring-1 ring-border shadow-sm lg:hidden">
              <CardContent className="p-4 grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2 text-caption">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span>{inspection.address}</span>
                </div>
                <div className="flex items-center gap-2 text-caption">
                  <Building className="h-4 w-4 text-muted-foreground" />
                  <span>{inspection.typology} · {inspection.property_type}</span>
                </div>
              </CardContent>
            </Card>

            {/* Section cards */}
            {sections.map((section) => {
              const sFields = fieldsBySection[section.id] ?? [];
              const sPhotos = photosBySection[section.id] ?? [];
              const sStatusFields = sFields.filter((f) => f.group_key === 'status');
              const hasMalo = sStatusFields.some((f) => f.value_text === 'malo');

              return (
                <Card
                  key={section.id}
                  id={`section-${section.id}`}
                  className={cn(
                    'border-0 ring-1 shadow-sm scroll-mt-20',
                    hasMalo ? 'ring-status-bad/30 border-l-4 border-l-status-bad' : 'ring-border'
                  )}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-body-lg">{section.section_title}</CardTitle>
                      <SectionStatusBadge status={section.status} />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {sStatusFields.map((f) => {
                      const label = statusLabel(f.value_text);
                      return (
                        <div key={f.id} className="flex items-center justify-between text-caption">
                          <span className="text-muted-foreground">{f.field_label}</span>
                          {label && <span className={label.className}>{label.text}</span>}
                        </div>
                      );
                    })}

                    {sFields.filter((f) => f.group_key !== 'status' && f.group_key !== 'photo' && f.value_text).map((f) => (
                      <div key={f.id} className="text-caption">
                        <span className="text-muted-foreground">{f.field_label}: </span>
                        <span>{f.value_text}</span>
                      </div>
                    ))}

                    {sPhotos.length > 0 && (
                      <div className="grid grid-cols-4 gap-2 mt-2">
                        {sPhotos.map((p) => (
                          <img
                            key={p.id}
                            src={p.public_url ?? ''}
                            alt={p.caption ?? ''}
                            className="aspect-square rounded-xl object-cover"
                          />
                        ))}
                      </div>
                    )}

                    {returnMode && (
                      <div className="mt-3 pt-3 border-t space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedReturnSections.has(section.id)}
                            onChange={() => toggleReturnSection(section.id)}
                            className="rounded"
                          />
                          <span className="text-caption font-medium">Marcar para corrección</span>
                        </label>
                        {selectedReturnSections.has(section.id) && (
                          <Textarea
                            placeholder="Comentario de corrección..."
                            value={returnComments[section.id] ?? ''}
                            onChange={(e) => setReturnComments((prev) => ({ ...prev, [section.id]: e.target.value }))}
                            rows={2}
                            className="text-caption"
                          />
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>

      {/* Sticky actions */}
      {['submitted', 'in_review'].includes(inspection.status) && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-card/90 backdrop-blur-sm border-t">
          <div className="container max-w-6xl flex gap-3">
            {returnMode ? (
              <>
                <Button variant="outline" onClick={() => setReturnMode(false)} className="flex-1" disabled={submitting}>
                  Cancelar
                </Button>
                <Button variant="destructive" onClick={handleReturnForChanges} className="flex-1" disabled={submitting}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Devolver ({selectedReturnSections.size})
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setReturnMode(true)} className="flex-1">
                  <RotateCcw className="mr-2 h-4 w-4" /> Devolver
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button className="flex-1 bg-status-good hover:bg-status-good/90" disabled={submitting}>
                      <CheckCircle2 className="mr-2 h-4 w-4" /> Aprobar
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>¿Aprobar inspección?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Esta acción marcará la inspección como aprobada y todas las secciones como revisadas.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={handleApprove}>Aprobar</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
