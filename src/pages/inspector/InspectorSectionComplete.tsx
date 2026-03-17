import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { SectionStatusBadge } from '@/components/StatusBadge';
import type { InspectionSection, InspectionFieldValue, InspectionPhoto, SaveStatus, InspectionReview } from '@/lib/types';
import { ArrowLeft, ArrowRight, Camera, Check, X, Loader2, Upload, Trash2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ensureInspectionStatusConsistency } from '@/lib/inspection-status-guard';

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
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [uploading, setUploading] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Load data
  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      const [secRes, allSecRes, fieldRes, photoRes, reviewRes] = await Promise.all([
        supabase.from('inspection_sections').select('*').eq('id', sectionId!).single(),
        supabase.from('inspection_sections').select('*').eq('inspection_id', inspectionId!).eq('is_visible', true).order('sort_order'),
        supabase.from('inspection_field_values').select('*').eq('inspection_section_id', sectionId!).order('sort_order'),
        supabase.from('inspection_photos').select('*').eq('inspection_section_id', sectionId!).order('sort_order'),
        supabase.from('inspection_reviews').select('*').eq('inspection_section_id', sectionId!).eq('comment_type', 'revision_request').order('created_at', { ascending: false }),
      ]);
      setSection(secRes.data as unknown as InspectionSection);
      setAllSections((allSecRes.data ?? []) as unknown as InspectionSection[]);
      setFields((fieldRes.data ?? []) as unknown as InspectionFieldValue[]);
      setPhotos((photoRes.data ?? []) as unknown as InspectionPhoto[]);
      setReviews((reviewRes.data ?? []) as unknown as InspectionReview[]);
      setLoading(false);
    };
    fetch();
  }, [inspectionId, sectionId]);

  // Update last active
  useEffect(() => {
    if (sectionId && inspectionId) {
      supabase
        .from('inspections')
        .update({ last_active_section_id: sectionId, last_active_at: new Date().toISOString() })
        .eq('id', inspectionId);
    }
  }, [sectionId, inspectionId]);

  // Save field
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

  // Handle status chip change
  const handleChipChange = (fieldId: string, value: string) => {
    setFields((prev) => prev.map((f) => f.id === fieldId ? { ...f, value_text: value } : f));
    saveField(fieldId, value);
    // Also update section status to in_progress
    if (section?.status === 'not_started' || section?.status === 'needs_changes') {
      supabase.from('inspection_sections').update({ status: 'in_progress' }).eq('id', sectionId!);
      setSection((prev) => prev ? { ...prev, status: 'in_progress' } : prev);
    }
  };

  // Handle text change (debounced)
  const handleTextChange = (fieldId: string, value: string) => {
    setFields((prev) => prev.map((f) => f.id === fieldId ? { ...f, value_text: value } : f));
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveField(fieldId, value), 1500);
  };

  // Handle blur save
  const handleTextBlur = (fieldId: string, value: string) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveField(fieldId, value);
  };

  // Photo upload
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !inspectionId || !sectionId || !section) return;

    for (const file of Array.from(files)) {
      const fileId = crypto.randomUUID();
      setUploading((prev) => new Set(prev).add(fileId));

      const ext = file.name.split('.').pop() || 'jpg';
      const path = `inspections/${inspectionId}/${section.section_key}/${fileId}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('inspection-photos')
        .upload(path, file);

      if (uploadError) {
        toast({ title: 'Error subiendo foto', description: uploadError.message, variant: 'destructive' });
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
    }
    // Reset input
    e.target.value = '';
  };

  // Delete photo
  const handleDeletePhoto = async (photo: InspectionPhoto) => {
    await supabase.storage.from('inspection-photos').remove([photo.storage_path]);
    await supabase.from('inspection_photos').delete().eq('id', photo.id);
    setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
  };

  // Mark complete
  const handleMarkComplete = async () => {
    const { error } = await supabase
      .from('inspection_sections')
      .update({ status: 'completed' })
      .eq('id', sectionId!);
    if (error) {
      toast({ title: 'Error', variant: 'destructive' });
    } else {
      setSection((prev) => prev ? { ...prev, status: 'completed' } : prev);
      // Navigate to next
      goNext();
    }
  };

  // Navigation
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

  if (loading) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Cargando...</div>;
  if (!section) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Sección no encontrada</div>;

  // Group fields
  const statusFields = fields.filter((f) => f.group_key === 'status' && f.is_visible);
  const observationFields = fields.filter((f) => f.group_key === 'observation' && f.is_visible);
  const technicalFields = fields.filter((f) => f.group_key === 'technical' && f.is_visible);
  const infoFields = fields.filter((f) => f.group_key === 'info' && f.is_visible);
  const measurementFields = fields.filter((f) => f.group_key === 'measurement' && f.is_visible);

  return (
    <div className="min-h-screen bg-background pb-28">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-card/80 backdrop-blur-sm">
        <div className="flex h-14 items-center gap-3 px-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/inspector/inspection/${inspectionId}`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">{section.section_title}</p>
            <p className="text-xs text-muted-foreground">{currentIndex + 1} de {allSections.length}</p>
          </div>
          <SectionStatusBadge status={section.status} />
        </div>
        {/* Save indicator */}
        <div className="h-1 relative">
          {saveStatus === 'saving' && <div className="absolute inset-0 bg-primary/30 animate-pulse" />}
          {saveStatus === 'saved' && <div className="absolute inset-0 bg-status-good/50" />}
          {saveStatus === 'error' && <div className="absolute inset-0 bg-destructive/50" />}
        </div>
      </header>

      <main className="px-4 py-4 space-y-4">
        {/* Revision requests callout */}
        {reviews.length > 0 && section.status === 'needs_changes' && (
          <Card className="border-0 ring-1 ring-status-bad/30 bg-status-bad-bg shadow-sm">
            <CardContent className="py-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-status-bad mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-status-bad">Cambios Requeridos</p>
                  {reviews.map((r) => (
                    <p key={r.id} className="text-sm text-foreground/80 mt-1">{r.comment}</p>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Info fields */}
        {infoFields.length > 0 && (
          <Card className="border-0 ring-1 ring-border/50 shadow-sm">
            <CardContent className="py-4 space-y-3">
              {infoFields.map((field) => (
                <div key={field.id} className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">{field.field_label}</label>
                  <Input
                    value={field.value_text ?? ''}
                    onChange={(e) => handleTextChange(field.id, e.target.value)}
                    onBlur={(e) => handleTextBlur(field.id, e.target.value)}
                    type={field.field_type === 'number' ? 'number' : field.field_type === 'email' ? 'email' : field.field_type === 'phone' ? 'tel' : 'text'}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Status chips */}
        {statusFields.map((field) => {
          const options = (field.value_json as { options?: Array<{ value: string; label: string }> })?.options ?? [];
          return (
            <Card key={field.id} className="border-0 ring-1 ring-border/50 shadow-sm">
              <CardContent className="py-4">
                <p className="text-sm font-medium mb-3">{field.field_label}</p>
                <div className="grid grid-cols-2 gap-2">
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
                        onClick={() => handleChipChange(field.id, opt.value)}
                        className={cn(
                          'h-14 rounded-xl text-sm font-medium transition-all ring-1',
                          selected ? `${colorClass} ring-2 shadow-sm` : 'bg-muted/50 text-muted-foreground ring-transparent hover:bg-muted'
                        )}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}

        {/* Technical fields */}
        {technicalFields.length > 0 && (
          <Card className="border-0 ring-1 ring-border/50 shadow-sm">
            <CardContent className="py-4 space-y-3">
              <p className="text-sm font-medium text-muted-foreground">Datos Técnicos</p>
              {technicalFields.map((field) => {
                if (field.field_type === 'single_select') {
                  const options = (field.value_json as { options?: Array<{ value: string; label: string }> })?.options ?? [];
                  return (
                    <div key={field.id} className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">{field.field_label}</label>
                      <div className="flex flex-wrap gap-2">
                        {options.map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => handleChipChange(field.id, opt.value)}
                            className={cn(
                              'px-3 py-2 rounded-lg text-xs font-medium transition-all ring-1',
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
                return (
                  <div key={field.id} className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">{field.field_label}</label>
                    <Input
                      value={field.value_text ?? ''}
                      onChange={(e) => handleTextChange(field.id, e.target.value)}
                      onBlur={(e) => handleTextBlur(field.id, e.target.value)}
                      type={field.field_type === 'date' ? 'date' : 'text'}
                    />
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Measurement fields */}
        {measurementFields.length > 0 && (
          <Card className="border-0 ring-1 ring-border/50 shadow-sm">
            <CardContent className="py-4 space-y-3">
              <p className="text-sm font-medium text-muted-foreground">Mediciones</p>
              {measurementFields.map((field) => (
                <div key={field.id} className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">{field.field_label}</label>
                  <Input
                    value={field.value_text ?? ''}
                    onChange={(e) => handleTextChange(field.id, e.target.value)}
                    onBlur={(e) => handleTextBlur(field.id, e.target.value)}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Observation */}
        {observationFields.map((field) => (
          <Card key={field.id} className="border-0 ring-1 ring-border/50 shadow-sm">
            <CardContent className="py-4 space-y-2">
              <label className="text-sm font-medium">{field.field_label}</label>
              <Textarea
                value={field.value_text ?? ''}
                onChange={(e) => handleTextChange(field.id, e.target.value)}
                onBlur={(e) => handleTextBlur(field.id, e.target.value)}
                placeholder="Escribe tus observaciones..."
                rows={3}
              />
            </CardContent>
          </Card>
        ))}

        {/* Photos */}
        <Card className="border-0 ring-1 ring-border/50 shadow-sm">
          <CardContent className="py-4">
            <p className="text-sm font-medium mb-3">Fotos</p>
            <div className="grid grid-cols-3 gap-2">
              {/* Upload button */}
              <label className="aspect-square rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors">
                <Camera className="h-6 w-6 text-muted-foreground" />
                <span className="text-xs text-muted-foreground mt-1">Añadir</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  capture="environment"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
              </label>

              {/* Uploading placeholders */}
              {Array.from(uploading).map((uid) => (
                <div key={uid} className="aspect-square rounded-xl bg-muted flex items-center justify-center">
                  <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
                </div>
              ))}

              {/* Photos */}
              {photos.map((photo) => (
                <div key={photo.id} className="aspect-square rounded-xl overflow-hidden relative group">
                  <img
                    src={photo.public_url ?? ''}
                    alt={photo.caption ?? 'Foto'}
                    className="w-full h-full object-cover"
                  />
                  <button
                    onClick={() => handleDeletePhoto(photo)}
                    className="absolute top-1 right-1 h-6 w-6 rounded-full bg-destructive/80 text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Sticky bottom navigation */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-card/90 backdrop-blur-sm border-t space-y-2">
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={goPrev}
            disabled={!prevSection}
            className="flex-1"
          >
            <ArrowLeft className="mr-1 h-4 w-4" /> Anterior
          </Button>
          <Button
            onClick={handleMarkComplete}
            className="flex-1"
            variant={section.status === 'completed' ? 'secondary' : 'default'}
          >
            <Check className="mr-1 h-4 w-4" />
            {section.status === 'completed' ? 'Completada ✓' : 'Completar'}
          </Button>
          <Button
            variant="outline"
            onClick={goNext}
            disabled={!nextSection}
            className="flex-1"
          >
            Siguiente <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
        {/* Save status */}
        <div className="text-center text-xs text-muted-foreground">
          {saveStatus === 'saving' && <span className="flex items-center justify-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Guardando...</span>}
          {saveStatus === 'saved' && <span className="text-status-good">✓ Guardado</span>}
          {saveStatus === 'error' && <span className="text-destructive">Error al guardar</span>}
        </div>
      </div>
    </div>
  );
}
