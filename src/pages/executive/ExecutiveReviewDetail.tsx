import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { InspectionStatusBadge, SectionStatusBadge } from '@/components/StatusBadge';
import { useToast } from '@/hooks/use-toast';
import { calculateProgress } from '@/lib/inspection-utils';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { Inspection, InspectionSection, InspectionFieldValue, InspectionPhoto, InspectionRepairItem, RepairCatalogItem, InspectionReview } from '@/lib/types';
import { ArrowLeft, CheckCircle2, RotateCcw, MapPin, Building, Plus, Trash2, Eye, EyeOff, Send, Link2, Copy, DollarSign, Search, PenLine, XCircle, AlertTriangle } from 'lucide-react';
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
  const [reviewsBySection, setReviewsBySection] = useState<Record<string, InspectionReview[]>>({});
  const [repairsBySection, setRepairsBySection] = useState<Record<string, InspectionRepairItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [returnMode, setReturnMode] = useState(false);
  const [returnComments, setReturnComments] = useState<Record<string, string>>({});
  const [selectedReturnSections, setSelectedReturnSections] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  // Internal comments & final observations edits
  const [internalNotes, setInternalNotes] = useState<Record<string, string>>({});
  const [finalObservations, setFinalObservations] = useState<Record<string, string>>({});
  const [savingField, setSavingField] = useState<string | null>(null);

  // Catalog drawer
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogItems, setCatalogItems] = useState<RepairCatalogItem[]>([]);
  const [catalogSectionId, setCatalogSectionId] = useState<string | null>(null);

  // Publish result
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [signatureRecord, setSignatureRecord] = useState<{ signature_status: string; signer_name: string | null; skip_reason: string | null } | null>(null);

  const fetchAll = useCallback(async () => {
    const { data: insp } = await supabase.from('inspections').select('*').eq('id', id!).single();
    setInspection(insp as unknown as Inspection);

    const { data: secs } = await supabase
      .from('inspection_sections').select('*').eq('inspection_id', id!).eq('is_visible', true).order('sort_order');
    const secList = (secs ?? []) as unknown as InspectionSection[];
    setSections(secList);

    const secIds = secList.map((s) => s.id);

    // Initialize final observations from DB
    const obsMap: Record<string, string> = {};
    secList.forEach((s) => { obsMap[s.id] = s.final_observation ?? ''; });
    setFinalObservations(obsMap);

    if (secIds.length > 0) {
      const [{ data: fields }, { data: photos }, { data: reviews }, { data: repairs }] = await Promise.all([
        supabase.from('inspection_field_values').select('*').in('inspection_section_id', secIds).order('sort_order'),
        supabase.from('inspection_photos').select('*').in('inspection_section_id', secIds).order('sort_order'),
        supabase.from('inspection_reviews').select('*').in('inspection_section_id', secIds).order('created_at'),
        supabase.from('inspection_repair_items').select('*').in('inspection_section_id', secIds).order('sort_order'),
      ]);

      const groupBy = <T extends { inspection_section_id: string }>(arr: T[]) => {
        const map: Record<string, T[]> = {};
        for (const item of arr) {
          if (!map[item.inspection_section_id]) map[item.inspection_section_id] = [];
          map[item.inspection_section_id].push(item);
        }
        return map;
      };

      setFieldsBySection(groupBy((fields ?? []) as unknown as InspectionFieldValue[]));
      setPhotosBySection(groupBy((photos ?? []) as unknown as InspectionPhoto[]));
      setReviewsBySection(groupBy((reviews ?? []) as unknown as InspectionReview[]));
      setRepairsBySection(groupBy((repairs ?? []) as unknown as InspectionRepairItem[]));

      // Init internal notes from existing reviews
      const notesMap: Record<string, string> = {};
      for (const r of (reviews ?? []) as unknown as InspectionReview[]) {
        if (r.comment_type === 'internal_note') {
          notesMap[r.inspection_section_id] = r.comment;
        }
      }
      setInternalNotes(notesMap);
    }

    // Fetch signature
    const { data: sigData } = await supabase
      .from('inspection_signatures')
      .select('signature_status, signer_name, skip_reason')
      .eq('inspection_id', id!)
      .limit(1);
    if (sigData && sigData.length > 0) {
      setSignatureRecord(sigData[0] as any);
    }

    // Auto-transition to in_review
    if (insp && (insp as unknown as Inspection).status === 'submitted') {
      await supabase.from('inspections').update({ status: 'in_review' }).eq('id', id!);
    }

    setLoading(false);
  }, [id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Save internal note
  const saveInternalNote = async (sectionId: string) => {
    setSavingField(sectionId + '-note');
    const note = internalNotes[sectionId]?.trim();
    if (!note) { setSavingField(null); return; }
    // Upsert: delete old, insert new
    const existing = (reviewsBySection[sectionId] ?? []).find((r) => r.comment_type === 'internal_note');
    if (existing) {
      // Update via delete + insert since reviews may not have UPDATE policy for comment
      // Actually we have INSERT policy, so just insert a new one. Old ones remain as history.
    }
    await supabase.from('inspection_reviews').insert({
      inspection_id: id!, inspection_section_id: sectionId,
      comment_type: 'internal_note', comment: note, created_by: profile?.id,
    });
    toast({ title: 'Nota guardada' });
    setSavingField(null);
  };

  // Save final observation
  const saveFinalObservation = async (sectionId: string) => {
    setSavingField(sectionId + '-obs');
    await supabase.from('inspection_sections').update({
      final_observation: finalObservations[sectionId]?.trim() || null,
    }).eq('id', sectionId);
    toast({ title: 'Observación guardada' });
    setSavingField(null);
  };

  // Toggle photo visibility
  const togglePhotoVisibility = async (photo: InspectionPhoto) => {
    const current = (photo as any).visible_to_owner ?? true;
    await supabase.from('inspection_photos').update({ visible_to_owner: !current }).eq('id', photo.id);
    // Refresh photos for that section
    const { data } = await supabase.from('inspection_photos').select('*').eq('inspection_section_id', photo.inspection_section_id).order('sort_order');
    setPhotosBySection((prev) => ({ ...prev, [photo.inspection_section_id]: (data ?? []) as unknown as InspectionPhoto[] }));
  };

  // Catalog
  const openCatalog = async (sectionId: string) => {
    setCatalogSectionId(sectionId);
    setCatalogSearch('');
    const { data } = await supabase.from('repair_catalog_items').select('*, repair_catalog_categories(*)').eq('is_active', true).order('name');
    setCatalogItems((data ?? []).map((i: any) => ({ ...i, category: i.repair_catalog_categories })) as unknown as RepairCatalogItem[]);
    setCatalogOpen(true);
  };

  const addRepairFromCatalog = async (catalogItem: RepairCatalogItem) => {
    if (!catalogSectionId) return;
    const existingRepairs = repairsBySection[catalogSectionId] ?? [];
    await supabase.from('inspection_repair_items').insert({
      inspection_id: id!,
      inspection_section_id: catalogSectionId,
      repair_catalog_item_id: catalogItem.id,
      title_snapshot: catalogItem.name,
      owner_friendly_name_snapshot: catalogItem.owner_friendly_name,
      description_snapshot: catalogItem.description,
      category_snapshot: catalogItem.category?.name ?? null,
      unit: catalogItem.unit,
      pricing_type: catalogItem.pricing_type,
      quantity: 1,
      unit_price: catalogItem.base_price,
      notes: null,
      visible_to_owner: true,
      sort_order: existingRepairs.length,
      created_by: profile?.id,
      updated_by: profile?.id,
    });
    setCatalogOpen(false);
    // Refresh repairs
    const { data } = await supabase.from('inspection_repair_items').select('*').eq('inspection_id', id!).order('sort_order');
    const groupBy = <T extends { inspection_section_id: string }>(arr: T[]) => {
      const map: Record<string, T[]> = {};
      for (const item of arr) {
        if (!map[item.inspection_section_id]) map[item.inspection_section_id] = [];
        map[item.inspection_section_id].push(item);
      }
      return map;
    };
    setRepairsBySection(groupBy((data ?? []) as unknown as InspectionRepairItem[]));
    toast({ title: 'Reparación agregada' });
  };

  const updateRepairItem = async (repairId: string, field: string, value: any) => {
    await supabase.from('inspection_repair_items').update({ [field]: value, updated_by: profile?.id }).eq('id', repairId);
    // Refresh
    const { data } = await supabase.from('inspection_repair_items').select('*').eq('inspection_id', id!).order('sort_order');
    const groupBy = <T extends { inspection_section_id: string }>(arr: T[]) => {
      const map: Record<string, T[]> = {};
      for (const item of arr) {
        if (!map[item.inspection_section_id]) map[item.inspection_section_id] = [];
        map[item.inspection_section_id].push(item);
      }
      return map;
    };
    setRepairsBySection(groupBy((data ?? []) as unknown as InspectionRepairItem[]));
  };

  const deleteRepairItem = async (repairId: string) => {
    await supabase.from('inspection_repair_items').delete().eq('id', repairId);
    const { data } = await supabase.from('inspection_repair_items').select('*').eq('inspection_id', id!).order('sort_order');
    const groupBy = <T extends { inspection_section_id: string }>(arr: T[]) => {
      const map: Record<string, T[]> = {};
      for (const item of arr) {
        if (!map[item.inspection_section_id]) map[item.inspection_section_id] = [];
        map[item.inspection_section_id].push(item);
      }
      return map;
    };
    setRepairsBySection(groupBy((data ?? []) as unknown as InspectionRepairItem[]));
    toast({ title: 'Reparación eliminada' });
  };

  // Publish
  const handlePublish = async () => {
    if (!inspection) return;

    // Validations
    const hasObservation = sections.some((s) => finalObservations[s.id]?.trim());
    if (!hasObservation) {
      toast({ title: 'Se requiere al menos una observación final', variant: 'destructive' });
      return;
    }
    const hasNeedsChanges = sections.some((s) => s.status === 'needs_changes');
    if (hasNeedsChanges) {
      toast({ title: 'Hay secciones pendientes de corrección', variant: 'destructive' });
      return;
    }

    setSubmitting(true);

    // Build normalized payload
    const allRepairs = Object.values(repairsBySection).flat();
    const visibleRepairs = allRepairs.filter((r) => r.visible_to_owner);
    const visiblePhotos = Object.values(photosBySection).flat().filter((p: any) => p.visible_to_owner !== false);

    const payload = {
      property: {
        property_id: inspection.property_id,
        property_name: inspection.property_name,
        address: inspection.address,
        market: inspection.market,
        typology: inspection.typology,
        property_type: inspection.property_type,
        inspection_type: inspection.inspection_type,
      },
      sections: sections.map((s) => ({
        id: s.id,
        title: s.section_title,
        type: s.section_type,
        final_observation: finalObservations[s.id]?.trim() || null,
        photos: visiblePhotos
          .filter((p) => p.inspection_section_id === s.id)
          .map((p) => ({ id: p.id, url: p.public_url, caption: p.caption })),
        repairs: visibleRepairs
          .filter((r) => r.inspection_section_id === s.id)
          .map((r) => ({
            name: r.owner_friendly_name_snapshot || r.title_snapshot,
            description: r.description_snapshot,
            category: r.category_snapshot,
            unit: r.unit,
            quantity: r.quantity,
            unit_price: r.unit_price,
            subtotal: r.subtotal,
          })),
      })),
      budget_total: visibleRepairs.reduce((sum, r) => sum + Number(r.subtotal), 0),
      published_at: new Date().toISOString(),
    };

    // Get next version number
    const { data: existing } = await supabase
      .from('inspection_report_versions')
      .select('version_number')
      .eq('inspection_id', id!)
      .order('version_number', { ascending: false })
      .limit(1);

    const nextVersion = ((existing?.[0] as any)?.version_number ?? 0) + 1;

    // Set all previous versions to is_latest = false
    await supabase.from('inspection_report_versions').update({ is_latest: false }).eq('inspection_id', id!);

    // Insert new version
    const publicToken = crypto.randomUUID();
    const { error } = await supabase.from('inspection_report_versions').insert({
      inspection_id: id!,
      version_number: nextVersion,
      status: 'published',
      public_token: publicToken,
      normalized_payload: payload as any,
      is_latest: true,
    });

    if (error) {
      toast({ title: 'Error al publicar', description: error.message, variant: 'destructive' });
      setSubmitting(false);
      return;
    }

    // Update inspection status
    await supabase.from('inspections').update({
      status: 'published',
      published_at: new Date().toISOString(),
      owner_url_generated_at: new Date().toISOString(),
      approved_at: new Date().toISOString(),
      approved_by: profile?.id,
    }).eq('id', id!);

    const url = `${window.location.origin}/reportes/${inspection.property_id}/${publicToken}`;
    setPublishedUrl(url);
    setPublishDialogOpen(true);
    setSubmitting(false);
    toast({ title: `Reporte v${nextVersion} publicado` });
  };

  const handleApprove = async () => {
    setSubmitting(true);
    const { error } = await supabase
      .from('inspections')
      .update({ status: 'approved', approved_at: new Date().toISOString(), approved_by: profile?.id })
      .eq('id', id!);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      await supabase.from('inspection_sections')
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
          inspection_id: id!, inspection_section_id: secId,
          comment_type: 'revision_request', comment: comment.trim(), created_by: profile?.id,
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
      if (next.has(secId)) next.delete(secId); else next.add(secId);
      return next;
    });
  };

  const copyUrl = () => {
    if (publishedUrl) {
      navigator.clipboard.writeText(publishedUrl);
      toast({ title: 'URL copiada al portapapeles' });
    }
  };

  // Budget calculations
  const allRepairs = Object.values(repairsBySection).flat();
  const grandTotal = allRepairs.filter((r) => r.visible_to_owner).reduce((sum, r) => sum + Number(r.subtotal), 0);

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

  const filteredCatalog = catalogItems.filter((i) =>
    !catalogSearch || i.name.toLowerCase().includes(catalogSearch.toLowerCase()) || (i.owner_friendly_name ?? '').toLowerCase().includes(catalogSearch.toLowerCase())
  );

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
          {grandTotal > 0 && (
            <Badge variant="outline" className="gap-1 text-body font-mono">
              <DollarSign className="h-3.5 w-3.5" />
              {grandTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </Badge>
          )}
        </div>
      </header>

      <div className="container max-w-6xl py-6">
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
                  {grandTotal > 0 && (
                    <div className="border-t pt-3">
                      <p className="text-caption text-muted-foreground mb-1">Presupuesto Total</p>
                      <p className="text-h4 font-bold font-mono">${grandTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-0 ring-1 ring-border shadow-sm">
                <CardContent className="p-4">
                  <p className="text-caption font-medium text-muted-foreground mb-2">Secciones</p>
                  <div className="space-y-1 max-h-[400px] overflow-y-auto">
                    {sections.map((s) => (
                      <a key={s.id} href={`#section-${s.id}`}
                        className="flex items-center justify-between py-1.5 px-2 rounded-lg text-caption hover:bg-muted/50 transition-colors">
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
            {/* Mobile summary */}
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

            {/* Tenant signature status */}
            {signatureRecord && (
              <Card className="border-0 ring-1 ring-border shadow-sm">
                <CardContent className="p-4 flex items-center gap-3">
                  {signatureRecord.signature_status === 'signed' ? (
                    <>
                      <PenLine className="h-4 w-4 text-[hsl(var(--status-good))]" />
                      <div>
                        <p className="text-caption font-medium text-[hsl(var(--status-good))]">Firmado</p>
                        {signatureRecord.signer_name && <p className="text-tiny text-muted-foreground">{signatureRecord.signer_name}</p>}
                      </div>
                    </>
                  ) : signatureRecord.signature_status === 'refused' ? (
                    <>
                      <XCircle className="h-4 w-4 text-[hsl(var(--status-bad))]" />
                      <div>
                        <p className="text-caption font-medium text-[hsl(var(--status-bad))]">Se negó a firmar</p>
                        {signatureRecord.skip_reason && <p className="text-tiny text-muted-foreground">{signatureRecord.skip_reason}</p>}
                      </div>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="h-4 w-4 text-[hsl(var(--status-regular))]" />
                      <div>
                        <p className="text-caption font-medium text-[hsl(var(--status-regular))]">No disponible</p>
                        {signatureRecord.skip_reason && <p className="text-tiny text-muted-foreground">{signatureRecord.skip_reason}</p>}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Section cards */}
            {sections.filter(s => s.section_type !== 'handover_meta').map((section) => {
              const sFields = fieldsBySection[section.id] ?? [];
              const sPhotos = photosBySection[section.id] ?? [];
              const sRepairs = repairsBySection[section.id] ?? [];
              const sStatusFields = sFields.filter((f) => f.group_key === 'status');
              const hasMalo = sStatusFields.some((f) => f.value_text === 'malo');
              const sectionSubtotal = sRepairs.filter((r) => r.visible_to_owner).reduce((s, r) => s + Number(r.subtotal), 0);

              // Inspector observation (first textarea/text field with group_key 'observation')
              const inspectorObs = sFields.find((f) => f.group_key === 'observation')?.value_text;

              return (
                <Card key={section.id} id={`section-${section.id}`}
                  className={cn('border-0 ring-1 shadow-sm scroll-mt-20', hasMalo ? 'ring-status-bad/30 border-l-4 border-l-status-bad' : 'ring-border')}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-body-lg">{section.section_title}</CardTitle>
                      <SectionStatusBadge status={section.status} />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Status fields */}
                    {sStatusFields.map((f) => {
                      const label = statusLabel(f.value_text);
                      return (
                        <div key={f.id} className="flex items-center justify-between text-caption">
                          <span className="text-muted-foreground">{f.field_label}</span>
                          {label && <span className={label.className}>{label.text}</span>}
                        </div>
                      );
                    })}

                    {/* Other fields */}
                    {sFields.filter((f) => f.group_key !== 'status' && f.group_key !== 'photo' && f.group_key !== 'observation' && f.value_text).map((f) => (
                      <div key={f.id} className="text-caption">
                        <span className="text-muted-foreground">{f.field_label}: </span>
                        <span>{f.value_text}</span>
                      </div>
                    ))}

                    {/* Inspector observation (read-only) */}
                    {inspectorObs && (
                      <div className="bg-muted/30 rounded-lg p-3 space-y-1">
                        <p className="text-tiny font-medium text-muted-foreground uppercase tracking-wider">Observación del Inspector</p>
                        <p className="text-caption">{inspectorObs}</p>
                      </div>
                    )}

                    {/* Photos with visibility toggles */}
                    {sPhotos.length > 0 && (
                      <div>
                        <p className="text-tiny font-medium text-muted-foreground uppercase tracking-wider mb-2">Fotos ({sPhotos.length})</p>
                        <div className="grid grid-cols-4 gap-2">
                          {sPhotos.map((p) => {
                            const visible = (p as any).visible_to_owner !== false;
                            return (
                              <div key={p.id} className="relative group">
                                <img src={p.public_url ?? ''} alt={p.caption ?? ''}
                                  className={cn('aspect-square rounded-xl object-cover', !visible && 'opacity-40')} />
                                <button onClick={() => togglePhotoVisibility(p)}
                                  className="absolute top-1 right-1 p-1 rounded-md bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity">
                                  {visible ? <Eye className="h-3.5 w-3.5 text-foreground" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Internal note */}
                    <div className="border-t pt-3 space-y-2">
                      <p className="text-tiny font-medium text-muted-foreground uppercase tracking-wider">Comentario Interno</p>
                      <Textarea
                        value={internalNotes[section.id] ?? ''}
                        onChange={(e) => setInternalNotes((p) => ({ ...p, [section.id]: e.target.value }))}
                        placeholder="Nota interna (no visible al propietario)..."
                        rows={2} className="text-caption"
                      />
                      <Button size="sm" variant="outline" onClick={() => saveInternalNote(section.id)}
                        disabled={savingField === section.id + '-note'}>
                        Guardar nota
                      </Button>
                    </div>

                    {/* Final observation (public) */}
                    <div className="border-t pt-3 space-y-2">
                      <p className="text-tiny font-medium text-muted-foreground uppercase tracking-wider">
                        Observación Final <Badge variant="secondary" className="text-tiny ml-1">Pública</Badge>
                      </p>
                      <Textarea
                        value={finalObservations[section.id] ?? ''}
                        onChange={(e) => setFinalObservations((p) => ({ ...p, [section.id]: e.target.value }))}
                        placeholder="Observación visible para el propietario..."
                        rows={3} className="text-caption"
                      />
                      <Button size="sm" variant="outline" onClick={() => saveFinalObservation(section.id)}
                        disabled={savingField === section.id + '-obs'}>
                        Guardar observación
                      </Button>
                    </div>

                    {/* Repair items */}
                    <div className="border-t pt-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-tiny font-medium text-muted-foreground uppercase tracking-wider">Reparaciones</p>
                        <Button size="sm" variant="outline" onClick={() => openCatalog(section.id)}>
                          <Plus className="mr-1 h-3.5 w-3.5" /> Agregar
                        </Button>
                      </div>

                      {sRepairs.length > 0 && (
                        <div className="space-y-2">
                          {sRepairs.map((repair) => (
                            <div key={repair.id} className={cn('rounded-lg border p-3 space-y-2', !repair.visible_to_owner && 'opacity-50 border-dashed')}>
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <p className="text-caption font-medium truncate">{repair.title_snapshot}</p>
                                  {repair.category_snapshot && <p className="text-tiny text-muted-foreground">{repair.category_snapshot}</p>}
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button onClick={() => updateRepairItem(repair.id, 'visible_to_owner', !repair.visible_to_owner)}
                                    className="p-1 rounded hover:bg-muted/50">
                                    {repair.visible_to_owner ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
                                  </button>
                                  <button onClick={() => deleteRepairItem(repair.id)}
                                    className="p-1 rounded hover:bg-destructive/10 text-destructive">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                              <div className="grid grid-cols-3 gap-2">
                                <div>
                                  <Label className="text-tiny">Cantidad</Label>
                                  <Input type="number" step="0.01" value={repair.quantity}
                                    onChange={(e) => updateRepairItem(repair.id, 'quantity', parseFloat(e.target.value) || 0)}
                                    className="h-8 text-caption" />
                                </div>
                                <div>
                                  <Label className="text-tiny">Precio unit.</Label>
                                  <Input type="number" step="0.01" value={repair.unit_price}
                                    onChange={(e) => updateRepairItem(repair.id, 'unit_price', parseFloat(e.target.value) || 0)}
                                    className="h-8 text-caption" />
                                </div>
                                <div>
                                  <Label className="text-tiny">Subtotal</Label>
                                  <p className="h-8 flex items-center text-caption font-mono font-medium">
                                    ${Number(repair.subtotal).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                                  </p>
                                </div>
                              </div>
                              <Input placeholder="Notas..." value={repair.notes ?? ''} className="h-8 text-caption"
                                onChange={(e) => updateRepairItem(repair.id, 'notes', e.target.value || null)} />
                            </div>
                          ))}
                          {sectionSubtotal > 0 && (
                            <div className="flex justify-end text-caption font-medium font-mono">
                              Subtotal: ${sectionSubtotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Return mode */}
                    {returnMode && (
                      <div className="border-t pt-3 space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={selectedReturnSections.has(section.id)}
                            onChange={() => toggleReturnSection(section.id)} className="rounded" />
                          <span className="text-caption font-medium">Marcar para corrección</span>
                        </label>
                        {selectedReturnSections.has(section.id) && (
                          <Textarea placeholder="Comentario de corrección..."
                            value={returnComments[section.id] ?? ''}
                            onChange={(e) => setReturnComments((prev) => ({ ...prev, [section.id]: e.target.value }))}
                            rows={2} className="text-caption" />
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
      {['submitted', 'in_review', 'approved'].includes(inspection.status) && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-card/90 backdrop-blur-sm border-t">
          <div className="container max-w-6xl flex gap-3">
            {returnMode ? (
              <>
                <Button variant="outline" onClick={() => setReturnMode(false)} className="flex-1" disabled={submitting}>
                  Cancelar
                </Button>
                <Button variant="destructive" onClick={handleReturnForChanges} className="flex-1" disabled={submitting}>
                  <RotateCcw className="mr-2 h-4 w-4" /> Devolver ({selectedReturnSections.size})
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setReturnMode(true)} className="flex-1">
                  <RotateCcw className="mr-2 h-4 w-4" /> Devolver
                </Button>
                {inspection.status !== 'approved' && (
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
                )}
                <Button onClick={handlePublish} disabled={submitting} className="flex-1">
                  <Send className="mr-2 h-4 w-4" /> Publicar Reporte
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Catalog search sheet */}
      <Sheet open={catalogOpen} onOpenChange={setCatalogOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Catálogo de Reparaciones</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar reparación..." value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)} className="pl-9" />
            </div>
            <div className="space-y-2 max-h-[calc(100vh-200px)] overflow-y-auto">
              {filteredCatalog.map((item) => (
                <button key={item.id} onClick={() => addRepairFromCatalog(item)}
                  className="w-full text-left p-3 rounded-lg border hover:bg-muted/50 transition-colors space-y-1">
                  <p className="text-caption font-medium">{item.name}</p>
                  {item.owner_friendly_name && <p className="text-tiny text-muted-foreground">{item.owner_friendly_name}</p>}
                  <div className="flex items-center gap-2 text-tiny text-muted-foreground">
                    <Badge variant="secondary" className="text-tiny">{item.category?.name}</Badge>
                    <span className="font-mono">${Number(item.base_price).toFixed(2)} / {item.unit}</span>
                  </div>
                </button>
              ))}
              {filteredCatalog.length === 0 && (
                <p className="text-center text-muted-foreground text-caption py-8">No se encontraron reparaciones</p>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Published URL dialog */}
      <Dialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-status-good" /> Reporte Publicado
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-caption text-muted-foreground">Comparte este link con el propietario:</p>
            <div className="flex gap-2">
              <Input readOnly value={publishedUrl ?? ''} className="flex-1 text-caption font-mono" />
              <Button variant="outline" size="icon" onClick={copyUrl}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => { setPublishDialogOpen(false); navigate('/executive'); }}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
