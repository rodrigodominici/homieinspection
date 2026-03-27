import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { InspectionStatusBadge, SectionStatusBadge } from '@/components/StatusBadge';
import { useToast } from '@/hooks/use-toast';
import { calculateProgress, getEffectiveSnapshot } from '@/lib/inspection-utils';
import { requiresFinalObservation } from '@/lib/section-completion';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type {
  Inspection, InspectionSection, InspectionFieldValue, InspectionPhoto,
  InspectionRepairItem, RepairCatalogItem, InspectionReview, Contractor,
} from '@/lib/types';
import {
  ArrowLeft, CheckCircle2, RotateCcw, MapPin, Building, Plus, Trash2,
  Eye, EyeOff, Send, Link2, Copy, DollarSign, Search, PenLine, XCircle,
  AlertTriangle, ExternalLink, RefreshCw, Clock, Camera, Wrench,
  ChevronLeft, ChevronRight, ZoomIn,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

// ─── Helpers ───────────────────────────────────────────────
const fmt = (n: number) => n.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtCurrency = (n: number) => `$${fmt(n)}`;

const groupBy = <T extends { inspection_section_id: string }>(arr: T[]) => {
  const map: Record<string, T[]> = {};
  for (const item of arr) {
    if (!map[item.inspection_section_id]) map[item.inspection_section_id] = [];
    map[item.inspection_section_id].push(item);
  }
  return map;
};

const statusLabel = (value: string | null) => {
  if (!value) return null;
  const labels: Record<string, { text: string; cls: string }> = {
    bueno: { text: 'Bueno', cls: 'text-[hsl(var(--status-good))]' },
    regular: { text: 'Regular', cls: 'text-[hsl(var(--status-regular))]' },
    malo: { text: 'Malo', cls: 'text-[hsl(var(--status-bad))] font-semibold' },
    no_aplica: { text: 'No Aplica', cls: 'text-[hsl(var(--status-na))]' },
  };
  return labels[value] ?? { text: value, cls: '' };
};

// ─── Main Component ────────────────────────────────────────
export default function ExecutiveReviewDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { toast } = useToast();

  // Core state
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [sections, setSections] = useState<InspectionSection[]>([]);
  const [fieldsBySection, setFieldsBySection] = useState<Record<string, InspectionFieldValue[]>>({});
  const [photosBySection, setPhotosBySection] = useState<Record<string, InspectionPhoto[]>>({});
  const [reviewsBySection, setReviewsBySection] = useState<Record<string, InspectionReview[]>>({});
  const [repairsBySection, setRepairsBySection] = useState<Record<string, InspectionRepairItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Active section for desktop
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);

  // Editing state
  const [internalNotes, setInternalNotes] = useState<Record<string, string>>({});
  const [finalObservations, setFinalObservations] = useState<Record<string, string>>({});
  const [savingField, setSavingField] = useState<string | null>(null);

  // Return mode
  const [returnMode, setReturnMode] = useState(false);
  const [returnComments, setReturnComments] = useState<Record<string, string>>({});
  const [selectedReturnSections, setSelectedReturnSections] = useState<Set<string>>(new Set());

  // Catalog
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogItems, setCatalogItems] = useState<RepairCatalogItem[]>([]);
  const [catalogSectionId, setCatalogSectionId] = useState<string | null>(null);

  // Publish
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);

  // Signature
  const [signatureRecord, setSignatureRecord] = useState<{
    signature_status: string; signer_name: string | null; skip_reason: string | null;
  } | null>(null);

  // Contractors
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [selectedContractorId, setSelectedContractorId] = useState<string | null>(null);

  // ─── Data fetching ─────────────────────────────────────
  const fetchAll = useCallback(async () => {
    const [{ data: insp }, { data: contractorData }] = await Promise.all([
      supabase.from('inspections').select('*').eq('id', id!).single(),
      supabase.from('contractors').select('*').eq('is_active', true).order('name'),
    ]);
    const inspData = insp as unknown as Inspection;
    setInspection(inspData);
    setContractors((contractorData ?? []) as unknown as Contractor[]);
    setSelectedContractorId((inspData as any)?.contractor_id ?? null);

    const { data: secs } = await supabase
      .from('inspection_sections').select('*').eq('inspection_id', id!).eq('is_visible', true).order('sort_order');
    const secList = (secs ?? []) as unknown as InspectionSection[];
    setSections(secList);

    const obsMap: Record<string, string> = {};
    secList.forEach((s) => { obsMap[s.id] = s.final_observation ?? ''; });
    setFinalObservations(obsMap);

    if (!activeSectionId && secList.length > 0) {
      const firstOp = secList.find(s => s.section_type !== 'property_meta' && s.section_type !== 'handover_meta');
      setActiveSectionId(firstOp?.id ?? secList[0].id);
    }

    const secIds = secList.map((s) => s.id);
    if (secIds.length > 0) {
      const [{ data: fields }, { data: photos }, { data: reviews }, { data: repairs }] = await Promise.all([
        supabase.from('inspection_field_values').select('*').in('inspection_section_id', secIds).order('sort_order'),
        supabase.from('inspection_photos').select('*').in('inspection_section_id', secIds).order('sort_order'),
        supabase.from('inspection_reviews').select('*').in('inspection_section_id', secIds).order('created_at'),
        supabase.from('inspection_repair_items').select('*').in('inspection_section_id', secIds).order('sort_order'),
      ]);

      setFieldsBySection(groupBy((fields ?? []) as unknown as InspectionFieldValue[]));
      setPhotosBySection(groupBy((photos ?? []) as unknown as InspectionPhoto[]));
      setReviewsBySection(groupBy((reviews ?? []) as unknown as InspectionReview[]));
      setRepairsBySection(groupBy((repairs ?? []) as unknown as InspectionRepairItem[]));

      const notesMap: Record<string, string> = {};
      for (const r of (reviews ?? []) as unknown as InspectionReview[]) {
        if (r.comment_type === 'internal_note') notesMap[r.inspection_section_id] = r.comment;
      }
      setInternalNotes(notesMap);
    }

    const { data: sigData } = await supabase
      .from('inspection_signatures').select('signature_status, signer_name, skip_reason')
      .eq('inspection_id', id!).limit(1);
    if (sigData && sigData.length > 0) setSignatureRecord(sigData[0] as any);

    if (insp && (insp as any).status === 'submitted') {
      await supabase.from('inspections').update({ status: 'in_review' }).eq('id', id!);
    }

    setLoading(false);
  }, [id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ─── Computed values ───────────────────────────────────
  const allRepairs = useMemo(() => Object.values(repairsBySection).flat(), [repairsBySection]);
  const clientTotal = useMemo(() => allRepairs.filter(r => r.visible_to_owner).reduce((s, r) => s + (r.quantity * r.unit_price), 0), [allRepairs]);
  const contractorTotal = useMemo(() => allRepairs.filter(r => r.visible_to_owner).reduce((s, r) => s + (r.quantity * (r as any).contractor_unit_price), 0), [allRepairs]);
  const utility = clientTotal - contractorTotal;

  const effectiveSnapshot = inspection ? getEffectiveSnapshot(inspection) : {};
  const warrantyDeposit = typeof effectiveSnapshot.warranty_deposit === 'number' ? effectiveSnapshot.warranty_deposit : null;
  const depositDiff = warrantyDeposit !== null ? warrantyDeposit - clientTotal : null;

  const progress = useMemo(() => calculateProgress(sections), [sections]);

  const operationalSections = useMemo(
    () => sections.filter(s => s.section_type !== 'property_meta' && s.section_type !== 'handover_meta'),
    [sections]
  );

  const missingSections = useMemo(
    () => operationalSections.filter(s => requiresFinalObservation(s.section_type) && !finalObservations[s.id]?.trim()),
    [operationalSections, finalObservations]
  );

  const activeSection = useMemo(
    () => operationalSections.find(s => s.id === activeSectionId) ?? operationalSections[0] ?? null,
    [operationalSections, activeSectionId]
  );

  const isPublished = !!inspection?.published_at;

  // ─── Actions ───────────────────────────────────────────
  const saveInternalNote = async (sectionId: string) => {
    setSavingField(sectionId + '-note');
    const note = internalNotes[sectionId]?.trim();
    if (!note) { setSavingField(null); return; }
    await supabase.from('inspection_reviews').insert({
      inspection_id: id!, inspection_section_id: sectionId,
      comment_type: 'internal_note', comment: note, created_by: profile?.id,
    });
    toast({ title: 'Nota guardada' });
    setSavingField(null);
  };

  const saveFinalObservation = async (sectionId: string) => {
    setSavingField(sectionId + '-obs');
    await supabase.from('inspection_sections').update({
      final_observation: finalObservations[sectionId]?.trim() || null,
    }).eq('id', sectionId);
    toast({ title: 'Observación guardada' });
    setSavingField(null);
  };

  const togglePhotoVisibility = async (photo: InspectionPhoto) => {
    const current = (photo as any).visible_to_owner ?? true;
    await supabase.from('inspection_photos').update({ visible_to_owner: !current }).eq('id', photo.id);
    const { data } = await supabase.from('inspection_photos').select('*').eq('inspection_section_id', photo.inspection_section_id).order('sort_order');
    setPhotosBySection((prev) => ({ ...prev, [photo.inspection_section_id]: (data ?? []) as unknown as InspectionPhoto[] }));
  };

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
      inspection_id: id!, inspection_section_id: catalogSectionId,
      repair_catalog_item_id: catalogItem.id, title_snapshot: catalogItem.name,
      owner_friendly_name_snapshot: catalogItem.owner_friendly_name,
      description_snapshot: catalogItem.description,
      category_snapshot: catalogItem.category?.name ?? null,
      unit: catalogItem.unit, pricing_type: catalogItem.pricing_type,
      quantity: 1, unit_price: catalogItem.base_price, contractor_unit_price: 0,
      notes: null, visible_to_owner: true, sort_order: existingRepairs.length,
      created_by: profile?.id, updated_by: profile?.id,
    });
    setCatalogOpen(false);
    const { data } = await supabase.from('inspection_repair_items').select('*').eq('inspection_id', id!).order('sort_order');
    setRepairsBySection(groupBy((data ?? []) as unknown as InspectionRepairItem[]));
    toast({ title: 'Reparación agregada' });
  };

  const updateRepairItem = async (repairId: string, field: string, value: any) => {
    await supabase.from('inspection_repair_items').update({ [field]: value, updated_by: profile?.id }).eq('id', repairId);
    const { data } = await supabase.from('inspection_repair_items').select('*').eq('inspection_id', id!).order('sort_order');
    setRepairsBySection(groupBy((data ?? []) as unknown as InspectionRepairItem[]));
  };

  const deleteRepairItem = async (repairId: string) => {
    await supabase.from('inspection_repair_items').delete().eq('id', repairId);
    const { data } = await supabase.from('inspection_repair_items').select('*').eq('inspection_id', id!).order('sort_order');
    setRepairsBySection(groupBy((data ?? []) as unknown as InspectionRepairItem[]));
    toast({ title: 'Reparación eliminada' });
  };

  const handleContractorChange = async (contractorId: string) => {
    setSelectedContractorId(contractorId === 'none' ? null : contractorId);
    await supabase.from('inspections').update({
      contractor_id: contractorId === 'none' ? null : contractorId,
    }).eq('id', id!);
    toast({ title: 'Contratista actualizado' });
  };

  const handlePublish = async () => {
    if (!inspection) return;
    if (missingSections.length > 0) {
      toast({
        title: `Faltan observaciones finales en ${missingSections.length} secciones`,
        description: missingSections.map(s => s.section_title).join(', '),
        variant: 'destructive',
      });
      return;
    }
    setSubmitting(true);
    const visibleRepairs = allRepairs.filter((r) => r.visible_to_owner);
    const visiblePhotos = Object.values(photosBySection).flat().filter((p: any) => p.visible_to_owner !== false);
    const payload = {
      property: {
        property_id: inspection.property_id, property_name: inspection.property_name,
        address: inspection.address, market: inspection.market,
        typology: inspection.typology, property_type: inspection.property_type,
        inspection_type: inspection.inspection_type,
      },
      sections: operationalSections.map((s) => ({
        id: s.id, title: s.section_title, type: s.section_type,
        final_observation: finalObservations[s.id]?.trim() || null,
        photos: visiblePhotos.filter((p) => p.inspection_section_id === s.id)
          .map((p) => ({ id: p.id, url: p.public_url, caption: p.caption })),
        repairs: visibleRepairs.filter((r) => r.inspection_section_id === s.id)
          .map((r) => ({
            name: r.owner_friendly_name_snapshot || r.title_snapshot,
            description: r.description_snapshot, category: r.category_snapshot,
            unit: r.unit, quantity: r.quantity, unit_price: r.unit_price,
            subtotal: r.quantity * r.unit_price,
          })),
      })),
      budget_total: clientTotal,
      published_at: new Date().toISOString(),
    };
    const { data: existing } = await supabase
      .from('inspection_report_versions').select('version_number')
      .eq('inspection_id', id!).order('version_number', { ascending: false }).limit(1);
    const nextVersion = ((existing?.[0] as any)?.version_number ?? 0) + 1;
    await supabase.from('inspection_report_versions').update({ is_latest: false }).eq('inspection_id', id!);
    const publicToken = crypto.randomUUID();
    const { error } = await supabase.from('inspection_report_versions').insert({
      inspection_id: id!, version_number: nextVersion, status: 'published',
      public_token: publicToken, normalized_payload: payload as any, is_latest: true,
    });
    if (error) {
      toast({ title: 'Error al publicar', description: error.message, variant: 'destructive' });
      setSubmitting(false);
      return;
    }
    await supabase.from('inspections').update({
      status: 'published', published_at: new Date().toISOString(),
      owner_url_generated_at: new Date().toISOString(),
      approved_at: new Date().toISOString(), approved_by: profile?.id,
    }).eq('id', id!);
    const url = `${window.location.origin}/reportes/${inspection.property_id}/${publicToken}`;
    setPublishedUrl(url);
    setPublishDialogOpen(true);
    setSubmitting(false);
    toast({ title: `Reporte v${nextVersion} publicado` });
    fetchAll();
  };

  const handleApprove = async () => {
    setSubmitting(true);
    await supabase.from('inspections')
      .update({ status: 'approved', approved_at: new Date().toISOString(), approved_by: profile?.id })
      .eq('id', id!);
    await supabase.from('inspection_sections')
      .update({ status: 'reviewed', reviewed_by: profile?.id, reviewed_at: new Date().toISOString() })
      .eq('inspection_id', id!);
    toast({ title: 'Inspección aprobada' });
    navigate('/executive');
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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copiado al portapapeles' });
  };

  const filteredCatalog = catalogItems.filter((i) =>
    !catalogSearch || i.name.toLowerCase().includes(catalogSearch.toLowerCase()) || (i.owner_friendly_name ?? '').toLowerCase().includes(catalogSearch.toLowerCase())
  );

  // ─── Loading / Not found ───────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="border-b bg-card p-4"><Skeleton className="h-8 w-64" /></div>
        <div className="p-6 space-y-4">
          <Skeleton className="h-24 rounded-xl" />
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      </div>
    );
  }
  if (!inspection) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Inspección no encontrada</div>;

  // ─── Inspector progress derived state ──────────────────
  const inspectorStarted = !!inspection.started_at;
  const inspectorProgressLabel = !inspectorStarted
    ? 'Pendiente de inicio'
    : progress.percent === 100
      ? 'Lista para revisión'
      : 'Inspección iniciada';
  const lastActiveRelative = inspection.last_active_at
    ? formatDistanceToNow(new Date(inspection.last_active_at), { addSuffix: true, locale: es })
    : null;

  // Published report URL
  const existingReportUrl = isPublished && inspection.property_id
    ? null // we'd need the token; show copy after publish
    : null;

  // ─── RENDER ────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-muted/30">
      {/* ── STICKY TOP SUMMARY BAR ─────────────────────── */}
      <header className="sticky top-0 z-30 border-b bg-card shadow-sm">
        <div className="px-4 lg:px-6">
          {/* Row 1: Property + status */}
          <div className="flex items-center gap-3 h-14">
            <Button variant="ghost" size="icon" onClick={() => navigate('/executive')} className="shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-semibold truncate">{inspection.property_name ?? inspection.property_id}</p>
                <InspectionStatusBadge status={inspection.status} />
              </div>
              <p className="text-tiny text-muted-foreground truncate">{inspection.address}</p>
            </div>
            {/* Global publication actions — single source */}
            <div className="hidden lg:flex items-center gap-2">
              {isPublished && (
                <>
                  <Button variant="outline" size="sm" onClick={() => {
                    window.open(`/reportes/${inspection.property_id}`, '_blank');
                  }}>
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Abrir reporte
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => {
                    const url = `${window.location.origin}/reportes/${inspection.property_id}`;
                    navigator.clipboard.writeText(url);
                    toast({ title: 'Link copiado' });
                  }}>
                    <Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar link
                  </Button>
                </>
              )}
              {isPublished ? (
                <Button size="sm" variant="outline" onClick={handlePublish} disabled={submitting}>
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Republicar
                </Button>
              ) : (
                <Button size="sm" onClick={handlePublish} disabled={submitting}>
                  <Send className="mr-1.5 h-3.5 w-3.5" /> Publicar
                </Button>
              )}
            </div>
          </div>

          {/* Row 2: Financial summary + contractor */}
          <div className="flex items-center gap-4 pb-3 overflow-x-auto text-caption border-t pt-2">
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-muted-foreground">Depósito en garantía:</span>
              <span className="font-mono font-medium">
                {warrantyDeposit !== null ? fmtCurrency(warrantyDeposit) : 'No disponible'}
              </span>
            </div>
            <div className="w-px h-4 bg-border shrink-0" />
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-muted-foreground">Presupuesto:</span>
              <span className="font-mono font-medium">{fmtCurrency(clientTotal)}</span>
            </div>
            {warrantyDeposit !== null && clientTotal > 0 && (
              <>
                <div className="w-px h-4 bg-border shrink-0" />
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-muted-foreground">Diferencia:</span>
                  <span className={cn('font-mono font-medium', depositDiff! >= 0 ? 'text-[hsl(var(--status-good))]' : 'text-[hsl(var(--status-bad))]')}>
                    {depositDiff! >= 0 ? '+' : ''}{fmtCurrency(depositDiff!)}
                  </span>
                </div>
              </>
            )}
            <div className="w-px h-4 bg-border shrink-0" />
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-muted-foreground">Contratista:</span>
              <Select value={selectedContractorId ?? 'none'} onValueChange={handleContractorChange}>
                <SelectTrigger className="h-7 w-40 text-tiny">
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin seleccionar</SelectItem>
                  {contractors.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name} ({c.country})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedContractorId && contractorTotal > 0 && (
              <>
                <div className="w-px h-4 bg-border shrink-0" />
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-muted-foreground">Costo contratista:</span>
                  <span className="font-mono font-medium">{fmtCurrency(contractorTotal)}</span>
                </div>
                <div className="w-px h-4 bg-border shrink-0" />
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-muted-foreground">Utilidad:</span>
                  <span className={cn('font-mono font-medium', utility >= 0 ? 'text-[hsl(var(--status-good))]' : 'text-[hsl(var(--status-bad))]')}>
                    {fmtCurrency(utility)}
                  </span>
                </div>
              </>
            )}
            {/* Inspector progress */}
            <div className="w-px h-4 bg-border shrink-0" />
            <div className="flex items-center gap-1.5 shrink-0">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">{inspectorProgressLabel}</span>
              <span className="font-medium">{progress.completed}/{progress.total}</span>
              {lastActiveRelative && <span className="text-muted-foreground">· {lastActiveRelative}</span>}
            </div>
          </div>

          {/* Row 3: Blocker indicators */}
          {(missingSections.length > 0 || (allRepairs.length > 0 && !selectedContractorId) || !isPublished) && (
            <div className="flex items-center gap-2 pb-2 overflow-x-auto flex-wrap">
              {missingSections.length > 0 && (
                <Badge variant="outline" className="text-tiny border-[hsl(var(--status-bad))]/30 text-[hsl(var(--status-bad))] bg-[hsl(var(--status-bad))]/5">
                  <AlertTriangle className="mr-1 h-3 w-3" />
                  {missingSections.length} observaciones finales pendientes
                </Badge>
              )}
              {allRepairs.length > 0 && !selectedContractorId && (
                <Badge variant="outline" className="text-tiny border-[hsl(var(--status-regular))]/30 text-[hsl(var(--status-regular))] bg-[hsl(var(--status-regular))]/5">
                  <AlertTriangle className="mr-1 h-3 w-3" />
                  Sin contratista asignado
                </Badge>
              )}
              {!isPublished && ['submitted', 'in_review', 'approved'].includes(inspection.status) && (
                <Badge variant="outline" className="text-tiny border-amber-300 text-amber-600 bg-amber-50">
                  Sin publicar
                </Badge>
              )}
            </div>
          )}
        </div>
      </header>

      {/* ── DESKTOP: 3-column layout ──────────────────── */}
      <div className="hidden lg:grid lg:grid-cols-[240px_1fr_300px] h-[calc(100vh-7rem)]">
        {/* LEFT SIDEBAR: Section nav */}
        <aside className="border-r bg-card overflow-y-auto p-3 space-y-1">
          <p className="text-tiny font-medium text-muted-foreground uppercase tracking-wider px-2 mb-2">Secciones</p>
          {/* Signature compliance block */}
          {signatureRecord && (
            <Card className={cn('mb-3 border-0 ring-1 shadow-sm',
              signatureRecord.signature_status === 'signed' ? 'ring-[hsl(var(--status-good))]/30 bg-[hsl(var(--status-good))]/5'
              : signatureRecord.signature_status === 'refused' ? 'ring-[hsl(var(--status-bad))]/30 bg-[hsl(var(--status-bad))]/5'
              : 'ring-[hsl(var(--status-regular))]/30 bg-[hsl(var(--status-regular))]/5'
            )}>
              <CardContent className="p-2.5 space-y-1">
                <div className="flex items-center gap-1.5 text-tiny font-medium">
                  {signatureRecord.signature_status === 'signed' ? <PenLine className="h-3.5 w-3.5 text-[hsl(var(--status-good))]" /> :
                   signatureRecord.signature_status === 'refused' ? <XCircle className="h-3.5 w-3.5 text-[hsl(var(--status-bad))]" /> :
                   <AlertTriangle className="h-3.5 w-3.5 text-[hsl(var(--status-regular))]" />}
                  <span>Firma del inquilino</span>
                </div>
                <p className="text-tiny text-muted-foreground">
                  {signatureRecord.signature_status === 'signed'
                    ? `Firmado${signatureRecord.signer_name ? ` por ${signatureRecord.signer_name}` : ''}`
                    : signatureRecord.signature_status === 'refused' ? 'Rechazada por el inquilino'
                    : 'Inquilino no disponible'}
                </p>
                {signatureRecord.skip_reason && (
                  <p className="text-tiny text-muted-foreground italic">{signatureRecord.skip_reason}</p>
                )}
              </CardContent>
            </Card>
          )}
          {operationalSections.map((s) => {
            const isActive = s.id === activeSectionId;
            const needsObs = requiresFinalObservation(s.section_type) && !finalObservations[s.id]?.trim();
            const photoCount = (photosBySection[s.id] ?? []).length;
            const repairCount = (repairsBySection[s.id] ?? []).length;
            return (
              <button key={s.id} onClick={() => setActiveSectionId(s.id)}
                className={cn(
                  'w-full text-left px-2 py-2 rounded-lg text-caption transition-colors',
                  isActive ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted/50'
                )}>
                <div className="flex items-center gap-1.5">
                  <span className="flex-1 truncate">{s.section_title}</span>
                  {needsObs && <span className="h-2 w-2 rounded-full bg-[hsl(var(--status-bad))] shrink-0" />}
                  <SectionStatusBadge status={s.status} />
                </div>
                {/* Indicator row */}
                <div className="flex items-center gap-2 mt-0.5 text-tiny text-muted-foreground">
                  {photoCount > 0 && (
                    <span className="flex items-center gap-0.5"><Camera className="h-3 w-3" />{photoCount}</span>
                  )}
                  {repairCount > 0 && (
                    <span className="flex items-center gap-0.5"><Wrench className="h-3 w-3" />{repairCount}</span>
                  )}
                  {needsObs && (
                    <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--status-bad))] shrink-0" title="Falta observación final" />
                  )}
                </div>
              </button>
            );
          })}
          {/* Missing observations summary */}
          {missingSections.length > 0 && (
            <div className="mt-3 px-2 py-2 rounded-lg bg-[hsl(var(--status-bad))]/5 text-tiny text-[hsl(var(--status-bad))]">
              <AlertTriangle className="inline h-3 w-3 mr-1" />
              Faltan observaciones en {missingSections.length} secciones
            </div>
          )}
        </aside>

        {/* CENTER: Review workspace */}
        <main className="overflow-y-auto p-6 space-y-6">
          {activeSection && <SectionWorkspace
            section={activeSection}
            fields={fieldsBySection[activeSection.id] ?? []}
            repairs={repairsBySection[activeSection.id] ?? []}
            reviews={reviewsBySection[activeSection.id] ?? []}
            inspectorObs={(fieldsBySection[activeSection.id] ?? []).find(f => f.group_key === 'observation')?.value_text ?? ''}
            finalObservation={finalObservations[activeSection.id] ?? ''}
            internalNote={internalNotes[activeSection.id] ?? ''}
            onFinalObsChange={(v) => setFinalObservations(p => ({ ...p, [activeSection.id]: v }))}
            onInternalNoteChange={(v) => setInternalNotes(p => ({ ...p, [activeSection.id]: v }))}
            onSaveFinalObs={() => saveFinalObservation(activeSection.id)}
            onSaveNote={() => saveInternalNote(activeSection.id)}
            savingField={savingField}
            onOpenCatalog={() => openCatalog(activeSection.id)}
            onUpdateRepair={updateRepairItem}
            onDeleteRepair={deleteRepairItem}
            hasContractor={!!selectedContractorId}
            returnMode={returnMode}
            returnSelected={selectedReturnSections.has(activeSection.id)}
            onToggleReturn={() => toggleReturnSection(activeSection.id)}
            returnComment={returnComments[activeSection.id] ?? ''}
            onReturnCommentChange={(v) => setReturnComments(p => ({ ...p, [activeSection.id]: v }))}
          />}
        </main>

        {/* RIGHT PANEL: Photos + financial summary */}
        <aside className="border-l bg-card overflow-y-auto p-4 space-y-4">
          {activeSection && (
            <PhotoPanel
              photos={photosBySection[activeSection.id] ?? []}
              onToggleVisibility={togglePhotoVisibility}
            />
          )}

          {/* Section-level subtotal only (global financials are in top bar) */}
          {activeSection && (repairsBySection[activeSection.id] ?? []).length > 0 && (
            <Card className="border-0 ring-1 ring-border shadow-sm">
              <CardContent className="p-3 space-y-1.5">
                <p className="text-tiny font-medium text-muted-foreground uppercase tracking-wider">Subtotal sección</p>
                <p className="text-body-lg font-semibold font-mono">
                  {fmtCurrency((repairsBySection[activeSection.id] ?? []).filter(r => r.visible_to_owner).reduce((s, r) => s + r.quantity * r.unit_price, 0))}
                </p>
                <p className="text-tiny text-muted-foreground">
                  {(repairsBySection[activeSection.id] ?? []).length} reparaciones en {activeSection.section_title}
                </p>
              </CardContent>
            </Card>
          )}
        </aside>
      </div>

      {/* ── MOBILE: Stacked fallback ──────────────────── */}
      <div className="lg:hidden pb-24">
        <div className="px-4 py-4 space-y-4">
          {/* Compact summary */}
          <Card className="border-0 ring-1 ring-border shadow-sm">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2 text-caption">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span>{inspection.address}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-caption">
                <div>
                  <span className="text-muted-foreground">Depósito:</span>{' '}
                  <span className="font-mono">{warrantyDeposit !== null ? fmtCurrency(warrantyDeposit) : '—'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Presupuesto:</span>{' '}
                  <span className="font-mono">{fmtCurrency(clientTotal)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 text-tiny text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>{inspectorProgressLabel} · {progress.completed}/{progress.total}</span>
              </div>
            </CardContent>
          </Card>

          {/* Signature */}
          {signatureRecord && (
            <Card className="border-0 ring-1 ring-border shadow-sm">
              <CardContent className="p-3 flex items-center gap-2 text-caption">
                {signatureRecord.signature_status === 'signed' ? <PenLine className="h-4 w-4 text-[hsl(var(--status-good))]" /> :
                 signatureRecord.signature_status === 'refused' ? <XCircle className="h-4 w-4 text-[hsl(var(--status-bad))]" /> :
                 <AlertTriangle className="h-4 w-4 text-[hsl(var(--status-regular))]" />}
                <span>Firma: {signatureRecord.signature_status === 'signed' ? `Firmado${signatureRecord.signer_name ? ` - ${signatureRecord.signer_name}` : ''}` :
                  signatureRecord.signature_status === 'refused' ? 'Rechazada' : 'No disponible'}</span>
              </CardContent>
            </Card>
          )}

          {/* Section cards (stacked) */}
          {operationalSections.map((section) => {
            const sFields = fieldsBySection[section.id] ?? [];
            const sPhotos = photosBySection[section.id] ?? [];
            const sRepairs = repairsBySection[section.id] ?? [];
            const inspectorObs = sFields.find(f => f.group_key === 'observation')?.value_text ?? '';
            return (
              <Card key={section.id} className="border-0 ring-1 ring-border shadow-sm">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-body-lg">{section.section_title}</CardTitle>
                    <SectionStatusBadge status={section.status} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Status fields */}
                  {sFields.filter(f => f.group_key === 'status').map(f => {
                    const label = statusLabel(f.value_text);
                    return (
                      <div key={f.id} className="flex justify-between text-caption">
                        <span className="text-muted-foreground">{f.field_label}</span>
                        {label && <span className={label.cls}>{label.text}</span>}
                      </div>
                    );
                  })}
                  {/* Inspector obs */}
                  {inspectorObs && (
                    <div className="bg-accent/30 rounded-lg p-3">
                      <p className="text-tiny font-medium text-muted-foreground mb-1">Inspector</p>
                      <p className="text-caption">{inspectorObs}</p>
                    </div>
                  )}
                  {/* Final obs */}
                  <div>
                    <p className="text-tiny font-medium text-muted-foreground mb-1">Observación final</p>
                    <Textarea value={finalObservations[section.id] ?? ''} rows={2} className="text-caption"
                      onChange={(e) => setFinalObservations(p => ({ ...p, [section.id]: e.target.value }))} />
                    <Button size="sm" variant="outline" className="mt-1" onClick={() => saveFinalObservation(section.id)}>
                      Guardar
                    </Button>
                  </div>
                  {/* Photos */}
                  {sPhotos.length > 0 && (
                    <div className="grid grid-cols-4 gap-1">
                      {sPhotos.map(p => (
                        <img key={p.id} src={p.public_url ?? ''} className="aspect-square rounded object-cover w-full" />
                      ))}
                    </div>
                  )}
                  {/* Repairs */}
                  {sRepairs.length > 0 && (
                    <div className="space-y-1">
                      {sRepairs.map(r => (
                        <div key={r.id} className="text-caption flex justify-between">
                          <span>{r.title_snapshot}</span>
                          <span className="font-mono">{fmtCurrency(r.quantity * r.unit_price)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <Button size="sm" variant="outline" onClick={() => openCatalog(section.id)} className="w-full">
                    <Plus className="mr-1 h-3.5 w-3.5" /> Agregar reparación
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Mobile bottom actions */}
        {['submitted', 'in_review', 'approved', 'published'].includes(inspection.status) && (
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-card/90 backdrop-blur-sm border-t">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setReturnMode(!returnMode)}>
                <RotateCcw className="mr-1 h-3.5 w-3.5" /> Devolver
              </Button>
              {isPublished ? (
                <Button size="sm" variant="outline" className="flex-1" onClick={handlePublish} disabled={submitting}>
                  <RefreshCw className="mr-1 h-3.5 w-3.5" /> Republicar
                </Button>
              ) : (
                <Button size="sm" className="flex-1" onClick={handlePublish} disabled={submitting}>
                  <Send className="mr-1 h-3.5 w-3.5" /> Publicar
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── DESKTOP bottom action bar ─────────────────── */}
      <div className="hidden lg:block">
        {['submitted', 'in_review', 'approved'].includes(inspection.status) && !returnMode && (
          <div className="fixed bottom-0 left-0 right-0 p-3 bg-card/90 backdrop-blur-sm border-t z-20">
            <div className="flex justify-center gap-3 max-w-3xl mx-auto">
              <Button variant="outline" onClick={() => setReturnMode(true)}>
                <RotateCcw className="mr-2 h-4 w-4" /> Devolver para cambios
              </Button>
              {inspection.status !== 'approved' && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button className="bg-[hsl(var(--status-good))] hover:bg-[hsl(var(--status-good))]/90" disabled={submitting}>
                      <CheckCircle2 className="mr-2 h-4 w-4" /> Aprobar
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>¿Aprobar inspección?</AlertDialogTitle>
                      <AlertDialogDescription>Marcará la inspección como aprobada y todas las secciones como revisadas.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={handleApprove}>Aprobar</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
        )}
        {returnMode && (
          <div className="fixed bottom-0 left-0 right-0 p-3 bg-card/90 backdrop-blur-sm border-t z-20">
            <div className="flex justify-center gap-3 max-w-3xl mx-auto">
              <Button variant="outline" onClick={() => setReturnMode(false)}>Cancelar</Button>
              <Button variant="destructive" onClick={handleReturnForChanges} disabled={submitting}>
                <RotateCcw className="mr-2 h-4 w-4" /> Devolver ({selectedReturnSections.size})
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Catalog sheet ──────────────────────────────── */}
      <Sheet open={catalogOpen} onOpenChange={setCatalogOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader><SheetTitle>Catálogo de Reparaciones</SheetTitle></SheetHeader>
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
              {filteredCatalog.length === 0 && <p className="text-center text-muted-foreground text-caption py-8">No se encontraron</p>}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Published URL dialog ──────────────────────── */}
      <Dialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-[hsl(var(--status-good))]" /> Reporte Publicado
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-caption text-muted-foreground">Comparte este link con el propietario:</p>
            <div className="flex gap-2">
              <Input readOnly value={publishedUrl ?? ''} className="flex-1 text-caption font-mono" />
              <Button variant="outline" size="icon" onClick={() => publishedUrl && copyToClipboard(publishedUrl)}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <Button variant="outline" className="w-full" onClick={() => publishedUrl && window.open(publishedUrl, '_blank')}>
              <ExternalLink className="mr-2 h-4 w-4" /> Abrir reporte propietario
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setPublishDialogOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Section Workspace (Center Panel) ────────────────────
interface SectionWorkspaceProps {
  section: InspectionSection;
  fields: InspectionFieldValue[];
  repairs: InspectionRepairItem[];
  reviews: InspectionReview[];
  inspectorObs: string;
  finalObservation: string;
  internalNote: string;
  onFinalObsChange: (v: string) => void;
  onInternalNoteChange: (v: string) => void;
  onSaveFinalObs: () => void;
  onSaveNote: () => void;
  savingField: string | null;
  onOpenCatalog: () => void;
  onUpdateRepair: (id: string, field: string, value: any) => void;
  onDeleteRepair: (id: string) => void;
  hasContractor: boolean;
  returnMode: boolean;
  returnSelected: boolean;
  onToggleReturn: () => void;
  returnComment: string;
  onReturnCommentChange: (v: string) => void;
}

function SectionWorkspace({
  section, fields, repairs, inspectorObs, finalObservation, internalNote,
  onFinalObsChange, onInternalNoteChange, onSaveFinalObs, onSaveNote,
  savingField, onOpenCatalog, onUpdateRepair, onDeleteRepair, hasContractor,
  returnMode, returnSelected, onToggleReturn, returnComment, onReturnCommentChange,
}: SectionWorkspaceProps) {
  const statusFields = fields.filter(f => f.group_key === 'status');
  const otherFields = fields.filter(f => f.group_key !== 'status' && f.group_key !== 'photo' && f.group_key !== 'observation' && f.value_text);
  const sectionSubtotalClient = repairs.filter(r => r.visible_to_owner).reduce((s, r) => s + (r.quantity * r.unit_price), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-h4 font-semibold">{section.section_title}</h2>
        <SectionStatusBadge status={section.status} />
      </div>

      {/* Status fields */}
      {statusFields.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {statusFields.map(f => {
            const label = statusLabel(f.value_text);
            return (
              <div key={f.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30 text-caption">
                <span className="text-muted-foreground">{f.field_label}</span>
                {label && <span className={label.cls}>{label.text}</span>}
              </div>
            );
          })}
        </div>
      )}

      {/* Other fields */}
      {otherFields.length > 0 && (
        <div className="space-y-1">
          {otherFields.map(f => (
            <div key={f.id} className="text-caption">
              <span className="text-muted-foreground">{f.field_label}: </span>
              <span>{f.value_text}</span>
            </div>
          ))}
        </div>
      )}

      {/* Side-by-side observations */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl bg-accent/30 p-4 space-y-2">
          <p className="text-tiny font-medium text-muted-foreground uppercase tracking-wider">Observación del Inspector</p>
          <p className="text-caption whitespace-pre-wrap">{inspectorObs || <span className="text-muted-foreground italic">Sin observación</span>}</p>
        </div>
        <div className="rounded-xl bg-[hsl(var(--status-good))]/5 p-4 space-y-2 ring-1 ring-[hsl(var(--status-good))]/10">
          <p className="text-tiny font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            Observación Final <Badge variant="secondary" className="text-tiny">Pública</Badge>
          </p>
          <Textarea value={finalObservation} rows={3} className="text-caption bg-transparent border-0 p-0 focus-visible:ring-0 resize-none"
            placeholder="Observación visible para el propietario..."
            onChange={(e) => onFinalObsChange(e.target.value)} />
          <Button size="sm" variant="outline" onClick={onSaveFinalObs}
            disabled={savingField === section.id + '-obs'} className="h-7 text-tiny">
            Guardar
          </Button>
        </div>
      </div>

      {/* Internal note */}
      <div className="space-y-2">
        <p className="text-tiny font-medium text-muted-foreground uppercase tracking-wider">Comentario Interno</p>
        <Textarea value={internalNote} rows={2} className="text-caption"
          placeholder="Nota interna (no visible al propietario)..."
          onChange={(e) => onInternalNoteChange(e.target.value)} />
        <Button size="sm" variant="outline" onClick={onSaveNote}
          disabled={savingField === section.id + '-note'} className="h-7 text-tiny">
          Guardar nota
        </Button>
      </div>

      {/* Repair items — prominent card */}
      <Card className="border-l-4 border-l-primary ring-1 ring-border shadow-sm">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wrench className="h-4 w-4 text-primary" />
              <p className="text-body-lg font-semibold">Reparaciones</p>
              {repairs.length > 0 && (
                <Badge variant="secondary" className="text-tiny">{repairs.length} items</Badge>
              )}
            </div>
            <Button size="sm" onClick={onOpenCatalog}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Agregar reparación
            </Button>
          </div>

          {repairs.length === 0 && (
            <p className="text-caption text-muted-foreground text-center py-4">Sin reparaciones en esta sección</p>
          )}

          {repairs.map((repair) => (
            <div key={repair.id} className={cn('rounded-lg border-2 p-3 space-y-2', !repair.visible_to_owner ? 'opacity-50 border-dashed' : 'border-border')}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-caption font-medium">{repair.title_snapshot}</p>
                  {repair.category_snapshot && <p className="text-tiny text-muted-foreground">{repair.category_snapshot}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => onUpdateRepair(repair.id, 'visible_to_owner', !repair.visible_to_owner)} className="p-1 rounded hover:bg-muted/50">
                    {repair.visible_to_owner ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
                  </button>
                  <button onClick={() => onDeleteRepair(repair.id)} className="p-1 rounded hover:bg-destructive/10 text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {/* Editable description */}
              <Textarea rows={2} className="text-tiny"
                placeholder="Descripción de reparación..."
                onBlur={(e) => onUpdateRepair(repair.id, 'description_snapshot', e.target.value || null)}
                defaultValue={repair.description_snapshot ?? ''}
                key={`desc-${repair.id}`}
              />
              <div className={cn('grid gap-2', hasContractor ? 'grid-cols-5' : 'grid-cols-3')}>
                <div>
                  <Label className="text-tiny">Cantidad</Label>
                  <Input type="number" step="0.01" value={repair.quantity}
                    onChange={(e) => onUpdateRepair(repair.id, 'quantity', parseFloat(e.target.value) || 0)}
                    className="h-8 text-caption" />
                </div>
                <div>
                  <Label className="text-tiny">Precio cliente</Label>
                  <Input type="number" step="1" value={repair.unit_price}
                    onChange={(e) => onUpdateRepair(repair.id, 'unit_price', parseFloat(e.target.value) || 0)}
                    className="h-8 text-caption" />
                </div>
                {hasContractor && (
                  <div>
                    <Label className="text-tiny">Precio contratista</Label>
                    <Input type="number" step="1" value={(repair as any).contractor_unit_price ?? 0}
                      onChange={(e) => onUpdateRepair(repair.id, 'contractor_unit_price', parseFloat(e.target.value) || 0)}
                      className="h-8 text-caption" />
                  </div>
                )}
                <div>
                  <Label className="text-tiny">Subtotal</Label>
                  <p className="h-8 flex items-center text-caption font-mono font-medium">
                    {fmtCurrency(repair.quantity * repair.unit_price)}
                  </p>
                </div>
                {hasContractor && (
                  <div>
                    <Label className="text-tiny text-muted-foreground">Utilidad</Label>
                    <p className="h-8 flex items-center text-caption font-mono text-muted-foreground">
                      {fmtCurrency((repair.unit_price - ((repair as any).contractor_unit_price ?? 0)) * repair.quantity)}
                    </p>
                  </div>
                )}
              </div>
              <Input placeholder="Notas..." value={repair.notes ?? ''} className="h-8 text-caption"
                onChange={(e) => onUpdateRepair(repair.id, 'notes', e.target.value || null)} />
            </div>
          ))}

          {sectionSubtotalClient > 0 && (
            <div className="flex justify-end text-body font-semibold font-mono pt-1 border-t">
              Subtotal: {fmtCurrency(sectionSubtotalClient)}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Return mode */}
      {returnMode && (
        <div className="border-t pt-3 space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={returnSelected} onChange={onToggleReturn} className="rounded" />
            <span className="text-caption font-medium">Marcar para corrección</span>
          </label>
          {returnSelected && (
            <Textarea placeholder="Comentario de corrección..." value={returnComment}
              onChange={(e) => onReturnCommentChange(e.target.value)} rows={2} className="text-caption" />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Photo Panel (Right sidebar) ─────────────────────────
function PhotoPanel({ photos, onToggleVisibility }: {
  photos: InspectionPhoto[];
  onToggleVisibility: (photo: InspectionPhoto) => void;
}) {
  const [featuredIdx, setFeaturedIdx] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);

  const featured = photos[featuredIdx] ?? null;
  const hasManyPhotos = photos.length > 4;

  if (photos.length === 0) {
    return (
      <div>
        <p className="text-tiny font-medium text-muted-foreground uppercase tracking-wider mb-2">Fotos (0)</p>
        <p className="text-tiny text-muted-foreground py-4 text-center">Sin fotos</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-tiny font-medium text-muted-foreground uppercase tracking-wider mb-2">
        Fotos ({photos.length})
      </p>

      {hasManyPhotos ? (
        <>
          {/* Featured preview */}
          {featured && (
            <div className="relative group mb-2">
              <img src={featured.public_url ?? ''} alt={featured.caption ?? ''}
                className={cn('w-full rounded-lg object-cover aspect-[4/3] cursor-pointer',
                  (featured as any).visible_to_owner === false && 'opacity-40'
                )}
                onClick={() => setDialogOpen(true)} />
              <div className="absolute bottom-2 right-2 flex gap-1">
                <button onClick={() => onToggleVisibility(featured)}
                  className="p-1.5 rounded-md bg-background/80 hover:bg-background transition-colors">
                  {(featured as any).visible_to_owner !== false ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
                </button>
                <button onClick={() => setDialogOpen(true)}
                  className="p-1.5 rounded-md bg-background/80 hover:bg-background transition-colors">
                  <ZoomIn className="h-3.5 w-3.5" />
                </button>
              </div>
              {featured.caption && (
                <p className="text-tiny text-muted-foreground mt-1">{featured.caption}</p>
              )}
            </div>
          )}
          {/* Thumbnail strip */}
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {photos.map((p, idx) => (
              <button key={p.id} onClick={() => setFeaturedIdx(idx)}
                className={cn('shrink-0 rounded-md overflow-hidden ring-2 transition-all',
                  idx === featuredIdx ? 'ring-primary' : 'ring-transparent hover:ring-muted-foreground/30',
                  (p as any).visible_to_owner === false && 'opacity-40'
                )}>
                <img src={p.public_url ?? ''} alt="" className="h-12 w-12 object-cover" />
              </button>
            ))}
          </div>
        </>
      ) : (
        /* Simple grid for ≤4 photos */
        <div className="grid grid-cols-2 gap-2">
          {photos.map((p) => {
            const visible = (p as any).visible_to_owner !== false;
            return (
              <div key={p.id} className="relative group">
                <img src={p.public_url ?? ''} alt={p.caption ?? ''}
                  className={cn('aspect-square rounded-lg object-cover w-full cursor-pointer', !visible && 'opacity-40')}
                  onClick={() => { setFeaturedIdx(photos.indexOf(p)); setDialogOpen(true); }} />
                <button onClick={() => onToggleVisibility(p)}
                  className="absolute top-1 right-1 p-1 rounded-md bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity">
                  {visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3 text-muted-foreground" />}
                </button>
                {p.caption && <p className="text-tiny text-muted-foreground mt-0.5 truncate">{p.caption}</p>}
              </div>
            );
          })}
        </div>
      )}

      {/* Full-resolution dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl p-2">
          <DialogHeader>
            <DialogTitle className="text-caption">
              Foto {featuredIdx + 1} de {photos.length}
              {featured?.caption && ` — ${featured.caption}`}
            </DialogTitle>
          </DialogHeader>
          {featured && (
            <div className="relative">
              <img src={featured.public_url ?? ''} alt={featured.caption ?? ''}
                className="w-full rounded-lg object-contain max-h-[70vh]" />
              {photos.length > 1 && (
                <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 flex justify-between px-2">
                  <Button variant="secondary" size="icon" className="h-8 w-8 rounded-full"
                    onClick={() => setFeaturedIdx(i => i > 0 ? i - 1 : photos.length - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="secondary" size="icon" className="h-8 w-8 rounded-full"
                    onClick={() => setFeaturedIdx(i => i < photos.length - 1 ? i + 1 : 0)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
