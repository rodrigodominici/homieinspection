import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { InspectionStatusBadge, SectionStatusBadge } from '@/components/StatusBadge';
import { useToast } from '@/hooks/use-toast';
import type { Inspection, InspectionSection, InspectionFieldValue, InspectionPhoto, InspectionReview } from '@/lib/types';
import { ArrowLeft, CheckCircle2, RotateCcw, MessageSquare, MapPin, Building } from 'lucide-react';
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

      // Batch fetch fields and photos
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

      // Mark as in_review
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
      .update({
        status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by: profile?.id,
      })
      .eq('id', id!);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      // Mark all sections as reviewed
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

    // Create revision_request comments
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
      // Mark section as needs_changes
      await supabase.from('inspection_sections').update({ status: 'needs_changes' }).eq('id', secId);
    }

    // Update inspection status
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

  if (loading) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Cargando...</div>;
  if (!inspection) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Inspección no encontrada</div>;

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

      <main className="container max-w-4xl py-6 space-y-6">
        {/* Property summary */}
        <Card className="border-0 ring-1 ring-border/50 shadow-sm">
          <CardContent className="py-4 grid grid-cols-2 gap-4">
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span>{inspection.address}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Building className="h-4 w-4 text-muted-foreground" />
              <span>{inspection.typology} · {inspection.property_type} · {inspection.inspection_type}</span>
            </div>
          </CardContent>
        </Card>

        {/* Sections review */}
        {sections.map((section) => {
          const sFields = fieldsBySection[section.id] ?? [];
          const sPhotos = photosBySection[section.id] ?? [];
          const sStatusFields = sFields.filter((f) => f.group_key === 'status');
          const sObservation = sFields.find((f) => f.group_key === 'observation');
          const hasMalo = sStatusFields.some((f) => f.value_text === 'malo');

          return (
            <Card
              key={section.id}
              className={cn(
                'border-0 ring-1 shadow-sm',
                hasMalo ? 'ring-status-bad/30 border-l-4 border-l-status-bad' : 'ring-border/50'
              )}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{section.section_title}</CardTitle>
                  <SectionStatusBadge status={section.status} />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Status fields */}
                {sStatusFields.map((f) => {
                  const label = statusLabel(f.value_text);
                  return (
                    <div key={f.id} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{f.field_label}</span>
                      {label && <span className={label.className}>{label.text}</span>}
                    </div>
                  );
                })}

                {/* Other non-status/non-photo fields */}
                {sFields.filter((f) => f.group_key !== 'status' && f.group_key !== 'photo' && f.value_text).map((f) => (
                  <div key={f.id} className="text-sm">
                    <span className="text-muted-foreground">{f.field_label}: </span>
                    <span>{f.value_text}</span>
                  </div>
                ))}

                {/* Photos */}
                {sPhotos.length > 0 && (
                  <div className="grid grid-cols-4 gap-2 mt-2">
                    {sPhotos.map((p) => (
                      <img
                        key={p.id}
                        src={p.public_url ?? ''}
                        alt={p.caption ?? ''}
                        className="aspect-square rounded-lg object-cover"
                      />
                    ))}
                  </div>
                )}

                {/* Return mode: select + comment */}
                {returnMode && (
                  <div className="mt-3 pt-3 border-t space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedReturnSections.has(section.id)}
                        onChange={() => toggleReturnSection(section.id)}
                        className="rounded"
                      />
                      <span className="text-sm font-medium">Marcar para corrección</span>
                    </label>
                    {selectedReturnSections.has(section.id) && (
                      <Textarea
                        placeholder="Comentario de corrección..."
                        value={returnComments[section.id] ?? ''}
                        onChange={(e) => setReturnComments((prev) => ({ ...prev, [section.id]: e.target.value }))}
                        rows={2}
                        className="text-sm"
                      />
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </main>

      {/* Sticky actions */}
      {['submitted', 'in_review'].includes(inspection.status) && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-card/90 backdrop-blur-sm border-t">
          <div className="container max-w-4xl flex gap-3">
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
                <Button onClick={handleApprove} className="flex-1 bg-status-good hover:bg-status-good/90" disabled={submitting}>
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Aprobar
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
