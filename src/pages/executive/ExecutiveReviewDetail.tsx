import ExecutiveLayout from '@/components/ExecutiveLayout';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { InspectionStatusBadge, SectionStatusBadge } from '@/components/StatusBadge';
import { useToast } from '@/hooks/use-toast';
import { calculateProgress, getEffectiveSnapshot } from '@/lib/inspection-utils';
import { requiresFinalObservation } from '@/lib/section-completion';
import { useSignedPhotoUrls } from '@/lib/photo-urls';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type {
  InspectionPhoto, RepairCatalogItem,
} from '@/lib/types';
import {
  ArrowLeft, RotateCcw, MapPin, Plus, Send, Copy, PenLine, XCircle,
  AlertTriangle, ExternalLink, RefreshCw, Clock, Wrench,
  ChevronDown, FileText,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { QuotationDialog } from '@/components/QuotationDialog';
import { cn } from '@/lib/utils';
import {
  useReviewDetail,
  repairsService,
  inspectionActions,
} from '@/modules/review/api';
import {
  PublishedUrlsDialog,
  MissingObservationsDialog,
  RepairCatalogSheet,
  ApproveInspectionDialog,
  type PublishedUrls,
} from '@/modules/review/components';
import {
  SectionWorkspace,
  PhotoPanel,
  SectionRepairsDrawer,
  SectionTotalsBreakdown,
  fmtCurrency,
  statusLabel,
} from './review-detail';

import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';




// ─── Main Component ────────────────────────────────────────
export default function ExecutiveReviewDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { toast } = useToast();

  // ─── Data (loaded by useReviewDetail) ────────────────────
  const {
    inspection, sections, fieldsBySection, photosBySection,
    reviewsBySection, repairsBySection, signatureRecord, contractors,
    initialInternalNotes, loading, refetch,
  } = useReviewDetail(id);
  const allPhotos = useMemo(() => Object.values(photosBySection).flat(), [photosBySection]);
  const urlOf = useSignedPhotoUrls(allPhotos);

  const [submitting, setSubmitting] = useState(false);

  // Active section for desktop
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);

  // Editing state (local textareas; autosaved silently)
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
  const [publishedUrls, setPublishedUrls] = useState<PublishedUrls | null>(null);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [missingObsDialogOpen, setMissingObsDialogOpen] = useState(false);
  const [quotationDialog, setQuotationDialog] = useState<{ open: boolean; payer: 'owner' | 'tenant' }>({ open: false, payer: 'owner' });

  // Contractors (selection is local UI state; data comes from the hook)
  const [selectedContractorId, setSelectedContractorId] = useState<string | null>(null);

  // Repairs side drawer (desktop). Holds the section id whose repairs are open.
  const [repairsDrawerSectionId, setRepairsDrawerSectionId] = useState<string | null>(null);
  // Which repair row inside the drawer is expanded for editing (accordion).
  const [expandedRepairId, setExpandedRepairId] = useState<string | null>(null);

  // ─── Hydrate local editing state from loaded data ──────
  useEffect(() => {
    const obs: Record<string, string> = {};
    sections.forEach((s) => { obs[s.id] = s.final_observation ?? ''; });
    setFinalObservations(obs);
  }, [sections]);

  useEffect(() => { setInternalNotes(initialInternalNotes); }, [initialInternalNotes]);

  useEffect(() => {
    setSelectedContractorId((inspection as any)?.contractor_id ?? null);
  }, [inspection]);

  // Default active section after sections load.
  useEffect(() => {
    if (activeSectionId || sections.length === 0) return;
    const firstOp = sections.find(s => s.section_type !== 'property_meta' && s.section_type !== 'handover_meta');
    setActiveSectionId(firstOp?.id ?? sections[0].id);
  }, [sections, activeSectionId]);


  // ─── Computed values ───────────────────────────────────
  const allRepairs = useMemo(() => Object.values(repairsBySection).flat(), [repairsBySection]);

  // Internal operational breakdown — aggregates ALL repair items regardless of visible_to_owner.
  // visible_to_owner only gates the published owner-facing payload (clientTotal below).
  const budgetBreakdown = useMemo(() => {
    const acc = { ownerRequired: 0, ownerOptional: 0, tenantRequired: 0, tenantOptional: 0 };
    const bySection: Record<string, { owner: number; tenant: number; total: number }> = {};
    for (const r of allRepairs) {
      const amount = (Number(r.quantity) || 0) * (Number(r.unit_price) || 0);
      if (r.payer_role === 'tenant') {
        if (r.payment_nature === 'optional') acc.tenantOptional += amount;
        else acc.tenantRequired += amount;
      } else {
        if (r.payment_nature === 'optional') acc.ownerOptional += amount;
        else acc.ownerRequired += amount;
      }
      const sid = r.inspection_section_id;
      if (!bySection[sid]) bySection[sid] = { owner: 0, tenant: 0, total: 0 };
      if (r.payer_role === 'tenant') bySection[sid].tenant += amount;
      else bySection[sid].owner += amount;
      bySection[sid].total += amount;
    }
    return {
      ...acc,
      bySection,
      ownerTotal: acc.ownerRequired + acc.ownerOptional,
      tenantTotal: acc.tenantRequired + acc.tenantOptional,
      grandTotal: acc.ownerRequired + acc.ownerOptional + acc.tenantRequired + acc.tenantOptional,
    };
  }, [allRepairs]);


  const clientTotal = useMemo(() => allRepairs.filter(r => r.visible_to_owner).reduce((s, r) => s + (r.quantity * r.unit_price), 0), [allRepairs]);
  const contractorTotal = useMemo(() => allRepairs.reduce((s, r) => s + (r.quantity * (r as any).contractor_unit_price), 0), [allRepairs]);
  const utility = budgetBreakdown.grandTotal - contractorTotal;

  const effectiveSnapshot = inspection ? getEffectiveSnapshot(inspection) : {};
  const warrantyDeposit = typeof effectiveSnapshot.warranty_deposit === 'number' ? effectiveSnapshot.warranty_deposit : null;
  // Deposit comparison is rebased on owner-mandatory items only (the deposit-relevant universe).
  const depositDiff = warrantyDeposit !== null ? warrantyDeposit - budgetBreakdown.ownerRequired : null;

  const progress = useMemo(() => calculateProgress(sections), [sections]);

  const operationalSections = useMemo(
    () => sections.filter(s => s.section_type !== 'property_meta' && s.section_type !== 'handover_meta'),
    [sections]
  );

  const missingSections = useMemo(
    () => operationalSections.filter(s => requiresFinalObservation(s.section_type) && !finalObservations[s.id]?.trim()),
    [operationalSections, finalObservations]
  );

  const showObservationWarnings = !['approved', 'published'].includes(inspection?.status ?? '');

  const activeSection = useMemo(
    () => operationalSections.find(s => s.id === activeSectionId) ?? operationalSections[0] ?? null,
    [operationalSections, activeSectionId]
  );

  const isPublished = !!inspection?.published_at;

  // ─── Actions ───────────────────────────────────────────
  // Silent save helpers — used by debounced autosave (no toasts, no UI state).
  const saveInternalNoteSilent = useCallback(async (sectionId: string, value: string) => {
    const note = value.trim();
    if (!note) return;
    await supabase.from('inspection_reviews').insert({
      inspection_id: id!, inspection_section_id: sectionId,
      comment_type: 'internal_note', comment: note, created_by: profile?.id,
    });
  }, [id, profile?.id]);

  const saveFinalObservationSilent = useCallback(async (sectionId: string, value: string) => {
    await supabase.from('inspection_sections').update({
      final_observation: value.trim() || null,
    }).eq('id', sectionId);
  }, []);

  // Legacy explicit-save (kept for any remaining callers); now silent too.
  const saveInternalNote = (sectionId: string) =>
    saveInternalNoteSilent(sectionId, internalNotes[sectionId] ?? '');
  const saveFinalObservation = (sectionId: string) =>
    saveFinalObservationSilent(sectionId, finalObservations[sectionId] ?? '');

  const togglePhotoVisibility = async (photo: InspectionPhoto) => {
    const current = (photo as any).visible_to_owner ?? true;
    try {
      await inspectionActions.togglePhotoVisibility(photo.id, current);
      await refetch();
    } catch (e: any) {
      toast({ title: 'No se pudo actualizar la foto', description: e?.message, variant: 'destructive' });
    }
  };

  const openCatalog = async (sectionId: string) => {
    setCatalogSectionId(sectionId);
    setCatalogSearch('');
    try {
      const items = await repairsService.fetchActiveCatalog();
      setCatalogItems(items);
      setCatalogOpen(true);
    } catch (e: any) {
      toast({ title: 'No se pudo cargar el catálogo', description: e?.message, variant: 'destructive' });
    }
  };

  const addRepairFromCatalog = async (catalogItem: RepairCatalogItem) => {
    if (!catalogSectionId || !id) return;
    const existingCount = (repairsBySection[catalogSectionId] ?? []).length;
    try {
      const { contractorPrice, priceSource } = await repairsService.addRepairFromCatalog({
        inspectionId: id,
        inspectionSectionId: catalogSectionId,
        catalogItem,
        existingCount,
        contractorId: selectedContractorId,
        profileId: profile?.id,
      });
      setCatalogOpen(false);
      await refetch();
      toast({
        title: 'Reparación agregada',
        description: priceSource === 'catalog'
          ? `Precio contratista autollenado: $${contractorPrice}`
          : selectedContractorId ? 'Sin precio de contratista configurado' : undefined,
      });
    } catch (e: any) {
      toast({ title: 'No se pudo agregar la reparación', description: e?.message, variant: 'destructive' });
    }
  };

  const updateRepairItem = async (repairId: string, field: string, value: any) => {
    try {
      await repairsService.updateRepairItem(repairId, field, value, profile?.id);
      await refetch();
    } catch (e: any) {
      toast({ title: 'No se pudo actualizar la reparación', description: e?.message, variant: 'destructive' });
    }
  };

  const deleteRepairItem = async (repairId: string) => {
    try {
      await repairsService.deleteRepairItem(repairId);
      await refetch();
      toast({ title: 'Reparación eliminada' });
    } catch (e: any) {
      toast({ title: 'No se pudo eliminar la reparación', description: e?.message, variant: 'destructive' });
    }
  };

  const handleContractorChange = async (contractorId: string) => {
    if (!id) return;
    const newContractorId = contractorId === 'none' ? null : contractorId;
    setSelectedContractorId(newContractorId);
    const updatedCount = await repairsService.rebindContractorPrices(id, newContractorId, allRepairs);
    if (updatedCount > 0) await refetch();
    toast({
      title: 'Contratista actualizado',
      description: newContractorId
        ? `${updatedCount} ${updatedCount === 1 ? 'precio recargado' : 'precios recargados'} desde la matriz`
        : 'Precios de contratista puestos en 0',
    });
  };

  const handlePublish = async (force = false) => {
    if (!inspection) return;
    if (!force && missingSections.length > 0) {
      setMissingObsDialogOpen(true);
      return;
    }
    setSubmitting(true);
    try {
      const result = await inspectionActions.publishInspection({
        inspection,
        operationalSections,
        allRepairs,
        photosBySection,
        finalObservations,
        clientTotal,
        profileId: profile?.id,
      });
      setPublishedUrls({ owner: result.ownerUrl, tenant: result.tenantUrl });
      setPublishDialogOpen(true);
      toast({ title: `Reporte v${result.versionNumber} publicado` });
      await refetch();
    } catch (e: any) {
      toast({ title: 'Error al publicar', description: e?.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async () => {
    if (!id) return;
    setSubmitting(true);
    try {
      await inspectionActions.approveInspection(id, profile?.id);
      toast({ title: 'Inspección aprobada' });
      navigate('/executive');
    } catch (e: any) {
      toast({ title: 'No se pudo aprobar', description: e?.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartReview = async () => {
    if (!inspection || inspection.status !== 'submitted' || !id) return;
    setSubmitting(true);
    try {
      await inspectionActions.startReview(id);
      toast({ title: 'Revisión iniciada' });
      await refetch();
    } catch (e: any) {
      toast({ title: 'No se pudo iniciar la revisión', description: e?.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleReturnForChanges = async () => {
    if (!id) return;
    if (selectedReturnSections.size === 0) {
      toast({ title: 'Selecciona al menos una sección', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      await inspectionActions.requestChanges({
        inspectionId: id,
        profileId: profile?.id,
        selectedSectionIds: Array.from(selectedReturnSections),
        commentsBySection: returnComments,
      });
      toast({ title: 'Devuelta para cambios' });
      navigate('/executive');
    } catch (e: any) {
      toast({ title: 'No se pudo devolver para cambios', description: e?.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
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


  // ─── Loading / Not found ───────────────────────────────
  if (loading) {
    return (
      <ExecutiveLayout>
        <div className="p-6 space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-24 rounded-xl" />
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      </ExecutiveLayout>
    );
  }
  if (!inspection) return <ExecutiveLayout><div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">Inspección no encontrada</div></ExecutiveLayout>;

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
    <ExecutiveLayout>
    <div className="min-h-[calc(100vh-3.5rem)] bg-muted/30">
      {/* ── STICKY TOP SUMMARY BAR ─────────────────────── */}
      <header className="sticky top-0 z-30 border-b bg-card">
        <div className="px-4 lg:px-6">
          {/* Row 1: Identity + primary actions */}
          <div className="flex items-center gap-3 h-14">
            <Button variant="ghost" size="icon" onClick={() => navigate('/executive')} className="shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-semibold truncate">{inspection.property_name ?? inspection.property_id}</p>
                <InspectionStatusBadge status={inspection.status} />
              </div>
              <div className="flex items-center gap-2 text-tiny text-muted-foreground truncate">
                <span className="truncate">{inspection.address}</span>
                <span className="text-border">·</span>
                <Clock className="h-3 w-3 shrink-0" />
                <span className="shrink-0">{inspectorProgressLabel} {progress.completed}/{progress.total}</span>
                {lastActiveRelative && <span className="shrink-0 truncate">· {lastActiveRelative}</span>}
              </div>
            </div>
            {/* Global publication actions — single source */}
            <div className="hidden lg:flex items-center gap-2">
              {['submitted', 'in_review'].includes(inspection.status) && !returnMode && (
                <>
                  <Button variant="outline" size="sm" onClick={() => setReturnMode(true)}>
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Devolver para cambios
                  </Button>
                  <ApproveInspectionDialog
                    operationalSections={operationalSections}
                    disabled={submitting}
                    onApprove={handleApprove}
                  />


                </>
              )}
              {isPublished && (
                <>
                  <Button variant="ghost" size="sm" onClick={() => {
                    window.open(`/reportes/${inspection.property_id}`, '_blank');
                  }}>
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Abrir
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => {
                    const url = `${window.location.origin}/reportes/${inspection.property_id}`;
                    navigator.clipboard.writeText(url);
                    toast({ title: 'Link copiado' });
                  }}>
                    <Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar link
                  </Button>
                </>
              )}
              {inspection.status === 'published' || inspection.status === 'sent' ? (
                <Button size="sm" variant="outline" onClick={() => handlePublish()} disabled={submitting}>
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Republicar
                </Button>
              ) : inspection.status === 'approved' ? (
                <Button size="sm" onClick={() => handlePublish()} disabled={submitting}>
                  <Send className="mr-1.5 h-3.5 w-3.5" /> Publicar
                </Button>
              ) : null}

            </div>
          </div>

          {/* Return mode top bar */}
          {returnMode && (
            <div className="hidden lg:flex items-center gap-3 h-10 border-t">
              <span className="text-caption text-muted-foreground">Selecciona secciones a devolver</span>
              <div className="flex-1" />
              <Button variant="outline" size="sm" onClick={() => setReturnMode(false)}>Cancelar</Button>
              <Button variant="destructive" size="sm" onClick={handleReturnForChanges} disabled={submitting}>
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Devolver ({selectedReturnSections.size})
              </Button>
            </div>
          )}

          {/* Row 2: Financial summary blocks + secondary actions */}
          <div className="flex items-stretch gap-2 pb-3 pt-2 border-t overflow-x-auto">
            {/* Depósito */}
            <div className="shrink-0 rounded-md bg-muted/40 px-3 py-1.5 min-w-[110px]">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Depósito</p>
              <p className="text-sm font-mono font-semibold">
                {warrantyDeposit !== null ? fmtCurrency(warrantyDeposit) : '—'}
              </p>
            </div>
            {/* Inquilino */}
            <div className="shrink-0 rounded-md bg-muted/40 px-3 py-1.5 min-w-[110px]">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Inquilino</p>
              <p className="text-sm font-mono font-semibold">{fmtCurrency(budgetBreakdown.tenantRequired)}</p>
            </div>
            {/* Inquilino Opcional */}
            <div className="shrink-0 rounded-md bg-muted/40 px-3 py-1.5 min-w-[110px]">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Inq. Opcional</p>
              <p className="text-sm font-mono font-semibold">{fmtCurrency(budgetBreakdown.tenantOptional)}</p>
            </div>
            {/* Inquilino Total S/IVA */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="shrink-0 rounded-md bg-muted/60 px-3 py-1.5 min-w-[120px] cursor-help">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Inq. Total S/IVA</p>
                  <p className="text-sm font-mono font-semibold">{fmtCurrency(budgetBreakdown.tenantTotal)}</p>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <SectionTotalsBreakdown sections={sections} bySection={budgetBreakdown.bySection} field="tenant" activeId={activeSectionId} />
              </TooltipContent>
            </Tooltip>
            {/* Propietario */}
            <div className="shrink-0 rounded-md bg-muted/40 px-3 py-1.5 min-w-[110px]">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Propietario</p>
              <p className="text-sm font-mono font-semibold">{fmtCurrency(budgetBreakdown.ownerRequired)}</p>
            </div>
            {/* Propietario Opcional */}
            <div className="shrink-0 rounded-md bg-muted/40 px-3 py-1.5 min-w-[110px]">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Prop. Opcional</p>
              <p className="text-sm font-mono font-semibold">{fmtCurrency(budgetBreakdown.ownerOptional)}</p>
            </div>
            {/* Propietario Total S/IVA */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="shrink-0 rounded-md bg-muted/60 px-3 py-1.5 min-w-[120px] cursor-help">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Prop. Total S/IVA</p>
                  <p className="text-sm font-mono font-semibold">{fmtCurrency(budgetBreakdown.ownerTotal)}</p>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <SectionTotalsBreakdown sections={sections} bySection={budgetBreakdown.bySection} field="owner" activeId={activeSectionId} />
              </TooltipContent>
            </Tooltip>
            {/* Total general — single strong emphasis */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="shrink-0 rounded-md bg-primary/10 px-3 py-1.5 min-w-[130px] cursor-help">
                  <p className="text-[10px] uppercase tracking-wide text-primary/70">Total general</p>
                  <p className="text-sm font-mono font-semibold text-primary">{fmtCurrency(budgetBreakdown.grandTotal)}</p>
                  {warrantyDeposit !== null && budgetBreakdown.ownerRequired > 0 && (
                    <p className={cn('text-[10px] font-mono', depositDiff! >= 0 ? 'text-[hsl(var(--status-good))]' : 'text-[hsl(var(--status-bad))]')}>
                      vs depósito {depositDiff! >= 0 ? '+' : ''}{fmtCurrency(depositDiff!)}
                    </p>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <SectionTotalsBreakdown sections={sections} bySection={budgetBreakdown.bySection} field="total" activeId={activeSectionId} />
              </TooltipContent>
            </Tooltip>



            <div className="flex-1" />

            {/* Secondary actions: Cotización + Contratista */}
            <div className="flex items-center gap-1 shrink-0">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground hover:text-foreground">
                    <FileText className="mr-1 h-3.5 w-3.5" /> Cotización <ChevronDown className="ml-0.5 h-3 w-3 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onClick={() => setQuotationDialog({ open: true, payer: 'owner' })}>
                    Propietario
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setQuotationDialog({ open: true, payer: 'tenant' })}>
                    Inquilino
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Presupuesto — global entry to the repair workflow.
                  TEMPORARY UX COMPROMISE: opens the per-section drawer for the
                  active (or first) section with repairs. Replace with a true
                  global budget view when one exists. */}
              <Button
                variant={allRepairs.length > 0 ? 'default' : 'outline'}
                size="sm"
                className="h-8 text-xs"
                onClick={() => {
                  const target =
                    activeSection ??
                    operationalSections.find(s => (repairsBySection[s.id] ?? []).length > 0) ??
                    operationalSections[0];
                  if (target) {
                    setActiveSectionId(target.id);
                    setExpandedRepairId(null);
                    setRepairsDrawerSectionId(target.id);
                  }
                }}
              >
                <Wrench className="mr-1 h-3.5 w-3.5" />
                Presupuesto
                {allRepairs.length > 0 && (
                  <span className="ml-1 opacity-80">· {allRepairs.length}</span>
                )}
              </Button>

              {/* Divider between global review controls and contractor context */}
              <div className="h-5 w-px bg-border mx-1" aria-hidden />

              {/* Contratista activo — labeled control that sets cost context */}
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground hidden sm:inline">
                  Contratista activo:
                </span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 text-xs max-w-[200px]">
                      {!selectedContractorId && (
                        <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--status-regular))] mr-1.5 shrink-0" aria-hidden />
                      )}
                      <span className="truncate">
                        {selectedContractorId
                          ? contractors.find(c => c.id === selectedContractorId)?.name ?? 'Contratista'
                          : 'Asignar contratista'}
                      </span>
                      <ChevronDown className="ml-0.5 h-3 w-3 opacity-60 shrink-0" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-72 p-3 space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Contratista activo
                      </Label>
                      <p className="text-tiny text-muted-foreground">
                        Define los costos base del presupuesto.
                      </p>
                      <Select value={selectedContractorId ?? 'none'} onValueChange={handleContractorChange}>
                        <SelectTrigger className="h-8 text-xs">
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
                      <div className="space-y-1 pt-2 border-t border-border/70 text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Costo contratista</span>
                          <span className="font-mono font-medium">{fmtCurrency(contractorTotal)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Utilidad</span>
                          <span className={cn('font-mono font-medium', utility >= 0 ? 'text-[hsl(var(--status-good))]' : 'text-[hsl(var(--status-bad))]')}>
                            {fmtCurrency(utility)}
                          </span>
                        </div>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>

          {/* Row 3: Consolidated blocker strip — single muted line */}
          {(() => {
            const blockers: string[] = [];
            if (showObservationWarnings && missingSections.length > 0) {
              blockers.push(`${missingSections.length} observaciones finales pendientes`);
            }
            if (allRepairs.length > 0 && !selectedContractorId) {
              blockers.push('sin contratista');
            }
            if (!isPublished && ['submitted', 'in_review', 'approved'].includes(inspection.status)) {
              blockers.push('sin publicar');
            }
            if (blockers.length === 0) return null;
            return (
              <div className="flex items-center gap-1.5 pb-2 text-tiny text-muted-foreground">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                <span className="truncate">{blockers.join(' · ')}</span>
              </div>
            );
          })()}
        </div>
      </header>

      {/* F3.2 · Sticky banner: submitted → in_review explicit transition */}
      {inspection.status === 'submitted' && (
        <div className="sticky top-[3.5rem] z-20 border-b bg-[hsl(var(--status-pending-bg))] text-[hsl(var(--status-pending-fg))]">
          <div className="px-4 lg:px-6 py-2.5 flex items-center gap-3">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Esta inspección está lista para tu revisión</p>
              <p className="text-tiny opacity-80">Inicia la revisión para registrar el cambio de estado y comenzar a editar.</p>
            </div>
            <Button variant="ghost" size="sm" className="hover:bg-background/40" disabled={submitting}>
              Solo visualizar
            </Button>
            <Button size="sm" onClick={handleStartReview} disabled={submitting}>
              Comenzar revisión
            </Button>
          </div>
        </div>
      )}




      {/* ── DESKTOP: 3-column layout ──────────────────── */}
      <div className="hidden lg:grid lg:grid-cols-[240px_1fr_300px] h-[calc(100vh-7rem)]">
        {/* LEFT SIDEBAR: Section nav */}
        <aside className="border-r bg-card overflow-y-auto p-3 space-y-1">
          {(() => {
            const total = operationalSections.length;
            const done = operationalSections.filter(s => s.status === 'reviewed' || s.status === 'completed').length;
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            return (
              <div className="px-2 mb-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-tiny font-medium text-muted-foreground uppercase tracking-wider">Secciones</p>
                  <span className="text-tiny text-muted-foreground">{done} de {total} revisadas</span>
                </div>
                <Progress value={pct} className="h-1" />
              </div>
            );
          })()}
          {/* Signature compliance block — neutral container */}
          {signatureRecord && (
            <div className="mb-3 rounded-md border border-border/60 bg-card p-2.5 space-y-1">
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
            </div>
          )}
          {operationalSections.map((s) => {
            const isActive = s.id === activeSectionId;
            const repairCount = (repairsBySection[s.id] ?? []).length;
            return (
              <button key={s.id} onClick={() => setActiveSectionId(s.id)}
                className={cn(
                  'w-full text-left px-2 py-1.5 rounded-md text-caption transition-colors',
                  isActive ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted/50'
                )}>
                <div className="flex items-center gap-1.5">
                  <span className="flex-1 leading-tight break-words">{s.section_title}</span>
                  {repairCount > 0 && (
                    <span className="text-[10px] text-muted-foreground shrink-0">· {repairCount}</span>
                  )}
                  <SectionStatusBadge status={s.status} />
                </div>
              </button>
            );
          })}
          {/* Missing observations summary */}
          {showObservationWarnings && missingSections.length > 0 && (
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
            onSaveFinalObsSilent={saveFinalObservationSilent}
            onSaveNoteSilent={saveInternalNoteSilent}
            onOpenRepairsDrawer={() => { setExpandedRepairId(null); setRepairsDrawerSectionId(activeSection.id); }}
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
              inspectionId={id!}
              sectionId={activeSection.id}
              sectionKey={activeSection.section_key}
              uploadedBy={profile?.id}
              onToggleVisibility={togglePhotoVisibility}
              onPhotosChanged={() => refetch()}
            />
          )}

          {/* Section-level subtotal moved into the "Reparaciones de esta sección" block below the main content. */}
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

          {/* Reparaciones — quick global summary (mobile/tablet). */}
          <Card className="border-0 ring-1 ring-border shadow-sm">
            <CardContent className="p-3 flex items-center gap-3">
              <div className={cn(
                'flex items-center justify-center h-8 w-8 rounded-md shrink-0',
                allRepairs.length > 0 ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
              )}>
                <Wrench className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-caption font-medium">
                  Presupuesto
                  {allRepairs.length > 0 && (
                    <span className="ml-1.5 text-tiny font-normal text-muted-foreground">· {allRepairs.length}</span>
                  )}
                </p>
                <p className="text-tiny text-muted-foreground truncate">
                  {allRepairs.length === 0
                    ? 'Aún no se han agregado reparaciones.'
                    : `Total cliente ${fmtCurrency(clientTotal)}`}
                </p>
              </div>
              {allRepairs.length > 0 && (() => {
                const firstWith = operationalSections.find(s => (repairsBySection[s.id] ?? []).length > 0);
                if (!firstWith) return null;
                return (
                  <Button size="sm" variant="outline" className="shrink-0 h-8 text-tiny"
                    onClick={() => { setExpandedRepairId(null); setRepairsDrawerSectionId(firstWith.id); }}>
                    Ver
                  </Button>
                );
              })()}
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
                  {/* Final obs — autosaved */}
                  <div>
                    <p className="text-tiny font-medium text-muted-foreground mb-1">Observación final</p>
                    <Textarea value={finalObservations[section.id] ?? ''} rows={2} className="text-caption"
                      onChange={(e) => setFinalObservations(p => ({ ...p, [section.id]: e.target.value }))}
                      onBlur={(e) => saveFinalObservationSilent(section.id, e.target.value)} />
                  </div>
                  {/* Photos */}
                  {sPhotos.length > 0 && (
                    <div className="grid grid-cols-4 gap-1">
                      {sPhotos.map(p => (
                        <img key={p.id} src={urlOf(p.id)} className="aspect-square rounded object-cover w-full" />
                      ))}
                    </div>
                  )}
                  {/* Reparaciones de esta sección — bordered subgroup, stackable header */}
                  {(() => {
                    const sSubtotal = sRepairs.filter(r => r.visible_to_owner).reduce((s, r) => s + r.quantity * r.unit_price, 0);
                    return (
                      <div className="rounded-lg border border-border bg-card overflow-hidden">
                        <div className="flex flex-col gap-2 px-3 py-2 border-b border-border/60 bg-muted/30">
                          <div className="flex items-center gap-2 min-w-0">
                            <Wrench className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <p className="text-caption font-semibold leading-tight">Reparaciones de esta sección</p>
                          </div>
                          <p className="text-tiny text-muted-foreground leading-tight">
                            {sRepairs.length} {sRepairs.length === 1 ? 'reparación' : 'reparaciones'}
                            {sRepairs.length > 0 && (
                              <> · Subtotal <span className="font-mono">{fmtCurrency(sSubtotal)}</span></>
                            )}
                          </p>
                          <Button size="sm" onClick={() => openCatalog(section.id)} className="w-full h-8 text-tiny">
                            <Plus className="mr-1 h-3.5 w-3.5" /> Agregar reparación
                          </Button>
                        </div>
                        {sRepairs.length === 0 ? (
                          <p className="text-tiny text-muted-foreground italic px-3 py-2">
                            Sin reparaciones. Agrega desde el catálogo.
                          </p>
                        ) : (
                          <ul className="divide-y divide-border/60">
                            {sRepairs.map(r => (
                              <li key={r.id} className="flex items-center gap-2 px-3 py-1.5 text-caption">
                                <span className="flex-1 min-w-0 truncate">{r.title_snapshot}</span>
                                <span className="font-mono shrink-0">{fmtCurrency(r.quantity * r.unit_price)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Mobile bottom actions */}
        {['in_review', 'approved', 'published', 'sent'].includes(inspection.status) && (
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-card/90 backdrop-blur-sm border-t">
            <div className="flex gap-2">
              {inspection.status === 'in_review' && (
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setReturnMode(!returnMode)}>
                  <RotateCcw className="mr-1 h-3.5 w-3.5" /> Devolver
                </Button>
              )}
              {inspection.status === 'approved' && (
                <Button size="sm" className="flex-1" onClick={() => handlePublish()} disabled={submitting}>
                  <Send className="mr-1 h-3.5 w-3.5" /> Publicar
                </Button>
              )}
              {(inspection.status === 'published' || inspection.status === 'sent') && (
                <Button size="sm" variant="outline" className="flex-1" onClick={() => handlePublish()} disabled={submitting}>
                  <RefreshCw className="mr-1 h-3.5 w-3.5" /> Republicar
                </Button>
              )}
            </div>
          </div>
        )}

      </div>

      {/* ── Repairs drawer (per-section, desktop-first) ─── */}
      {(() => {
        const sec = operationalSections.find(s => s.id === repairsDrawerSectionId);
        if (!sec) return null;
        return (
          <SectionRepairsDrawer
            open={!!repairsDrawerSectionId}
            onOpenChange={(o) => { if (!o) setRepairsDrawerSectionId(null); }}
            section={sec}
            repairs={repairsBySection[sec.id] ?? []}
            hasContractor={!!selectedContractorId}
            expandedRepairId={expandedRepairId}
            onToggleExpand={(id) => setExpandedRepairId(prev => prev === id ? null : id)}
            onOpenCatalog={() => openCatalog(sec.id)}
            onUpdateRepair={updateRepairItem}
            onDeleteRepair={deleteRepairItem}
          />
        );
      })()}

      {/* ── Catalog sheet ──────────────────────────────── */}
      <RepairCatalogSheet
        open={catalogOpen}
        onOpenChange={setCatalogOpen}
        search={catalogSearch}
        onSearchChange={setCatalogSearch}
        items={catalogItems}
        onSelect={addRepairFromCatalog}
      />

      {/* ── Published URL dialog (dual: owner + tenant) ──── */}
      <PublishedUrlsDialog
        open={publishDialogOpen}
        onOpenChange={setPublishDialogOpen}
        urls={publishedUrls}
        onCopy={copyToClipboard}
      />

      {/* ── Missing final observations confirm ────────── */}
      <MissingObservationsDialog
        open={missingObsDialogOpen}
        onOpenChange={setMissingObsDialogOpen}
        missingSections={missingSections}
        onConfirm={() => void handlePublish(true)}
      />


      {/* ── Quotation dialog ──────────────────────────── */}
      <QuotationDialog
        open={quotationDialog.open}
        onOpenChange={(open) => setQuotationDialog((q) => ({ ...q, open }))}
        payer={quotationDialog.payer}
        inspection={inspection}
        repairs={allRepairs}
      />
    </div>
    </ExecutiveLayout>
  );
}

// ─── Section Workspace (Center Panel) ────────────────────
//
// Repairs are NOT edited inline anymore (was a long scroll).
// SectionWorkspace renders only the review content (fields, observations,
// photos, internal note). A compact "Reparaciones" strip near the top
// shows the section's repair count + subtotal and triggers
// `SectionRepairsDrawer` (right side panel) for editing.
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
  onSaveFinalObsSilent: (sectionId: string, value: string) => Promise<void>;
  onSaveNoteSilent: (sectionId: string, value: string) => Promise<void>;
  onOpenRepairsDrawer: () => void;
  returnMode: boolean;
  returnSelected: boolean;
  onToggleReturn: () => void;
  returnComment: string;
  onReturnCommentChange: (v: string) => void;
}

function SectionWorkspace({
  section, fields, repairs, inspectorObs, finalObservation, internalNote,
  onFinalObsChange, onInternalNoteChange, onSaveFinalObsSilent, onSaveNoteSilent,
  onOpenRepairsDrawer,
  returnMode, returnSelected, onToggleReturn, returnComment, onReturnCommentChange,
}: SectionWorkspaceProps) {
  const statusFields = fields.filter(f => f.group_key === 'status');
  const otherFields = fields.filter(f => f.group_key !== 'status' && f.group_key !== 'photo' && f.group_key !== 'observation' && f.value_text);
  const sectionSubtotalClient = repairs.filter(r => r.visible_to_owner).reduce((s, r) => s + (r.quantity * r.unit_price), 0);

  const finalObsAutosave = useDebouncedAutosave(
    finalObservation,
    (v) => onSaveFinalObsSilent(section.id, v),
  );
  const noteAutosave = useDebouncedAutosave(
    internalNote,
    (v) => onSaveNoteSilent(section.id, v),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-h4 font-semibold">{section.section_title}</h2>
        <SectionStatusBadge status={section.status} />
      </div>

      {/* Reparaciones de esta sección — moved below as the operational outcome of the review. */}

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

      {/* Side-by-side observations — public (left border primary) vs internal (gray bg) */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-border/60 p-3 space-y-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Observación del Inspector</p>
          <p className="text-caption whitespace-pre-wrap">{inspectorObs || <span className="text-muted-foreground italic">Sin observación</span>}</p>
        </div>
        <div className="rounded-lg border border-border/60 border-l-[3px] border-l-primary p-3 space-y-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5 cursor-help">
                <Globe className="h-3 w-3 text-primary" />
                Observación Final · Visible para propietario/inquilino
              </p>
            </TooltipTrigger>
            <TooltipContent>Este texto aparecerá en el reporte público</TooltipContent>
          </Tooltip>
          <Textarea value={finalObservation} rows={3} className="text-caption bg-transparent border-0 p-0 focus-visible:ring-0 resize-none"
            placeholder="Observación visible para el propietario..."
            onChange={(e) => onFinalObsChange(e.target.value)}
            onBlur={() => finalObsAutosave.flush()} />
          <div className="flex justify-end">
            <AutosaveStatus status={finalObsAutosave.status} />
          </div>
        </div>
      </div>

      {/* Internal note — gray background, lock icon */}
      <div className="space-y-1.5 rounded-lg bg-muted/40 p-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5 cursor-help">
              <LockIcon className="h-3 w-3" />
              Comentario Interno · Solo visible para el equipo
            </p>
          </TooltipTrigger>
          <TooltipContent>Este texto NO aparece en el reporte público</TooltipContent>
        </Tooltip>
        <Textarea value={internalNote} rows={2} className="text-caption bg-card"
          placeholder="Nota interna (no visible al propietario)..."
          onChange={(e) => onInternalNoteChange(e.target.value)}
          onBlur={() => noteAutosave.flush()} />
        <div className="flex justify-end">
          <AutosaveStatus status={noteAutosave.status} />
        </div>
      </div>




      {/* Reparaciones de esta sección — operational outcome of the review.
          Header (title + count + subtotal + CTA) stacks vertically on narrow widths. */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-3 border-b border-border/60 bg-muted/30">
          <div className="flex items-center gap-2 min-w-0">
            <Wrench className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight">Reparaciones de esta sección</p>
              <p className="text-xs text-muted-foreground leading-tight mt-0.5">
                {repairs.length} {repairs.length === 1 ? 'reparación' : 'reparaciones'}
                {repairs.length > 0 && (
                  <> · Subtotal <span className="font-mono">{fmtCurrency(sectionSubtotalClient)}</span></>
                )}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={onOpenRepairsDrawer}
            className="h-8 text-xs w-full sm:w-auto shrink-0"
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Agregar reparación
          </Button>
        </div>
        {repairs.length === 0 ? (
          <p className="text-xs text-muted-foreground italic px-4 py-3">
            Sin reparaciones. Agrega desde el catálogo.
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {repairs.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={onOpenRepairsDrawer}
                  className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-muted/40 transition-colors"
                >
                  <span className="flex-1 min-w-0 text-caption truncate">{r.title_snapshot}</span>
                  <span className="font-mono text-caption shrink-0">{fmtCurrency(r.quantity * r.unit_price)}</span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

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
function PhotoPanel({
  photos, inspectionId, sectionId, sectionKey, uploadedBy,
  onToggleVisibility, onPhotosChanged,
}: {
  photos: InspectionPhoto[];
  inspectionId: string;
  sectionId: string;
  sectionKey: string;
  uploadedBy?: string;
  onToggleVisibility: (photo: InspectionPhoto) => void;
  onPhotosChanged: (next: InspectionPhoto[]) => void;
}) {
  const { toast } = useToast();
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const urlOf = useSignedPhotoUrls(photos);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const { uploadInspectionPhotos } = await import('@/shared/lib/inspection-photos');
      const inserted = await uploadInspectionPhotos({
        inspectionId, sectionId, sectionKey, files, uploadedBy,
        startingSortOrder: photos.length,
      });
      onPhotosChanged([...photos, ...inserted]);
    } catch (e: any) {
      toast({ title: 'Error subiendo foto', description: e?.message ?? '', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (photo: InspectionPhoto) => {
    try {
      const { deleteInspectionPhoto } = await import('@/shared/lib/inspection-photos');
      await deleteInspectionPhoto(photo);
      onPhotosChanged(photos.filter((p) => p.id !== photo.id));
      toast({ title: 'Foto eliminada' });
    } catch (e: any) {
      toast({ title: 'No se pudo eliminar', description: e?.message ?? '', variant: 'destructive' });
    } finally {
      setConfirmDeleteId(null);
    }
  };

  const featured = lightboxIdx !== null ? photos[lightboxIdx] : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-muted-foreground">Fotos · {photos.length}</p>
        <input
          ref={fileRef} type="file" accept="image/*" multiple className="hidden"
          onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
        />
        <Button
          type="button" variant="ghost" size="sm"
          className="h-7 px-2 text-xs gap-1"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          <Plus className="h-3.5 w-3.5" />
          {uploading ? 'Subiendo…' : 'Subir'}
        </Button>
      </div>

      {photos.length === 0 ? (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="w-full aspect-[4/3] rounded-lg border-2 border-dashed border-border/70 flex flex-col items-center justify-center text-muted-foreground hover:bg-muted/40 transition-colors"
        >
          <Camera className="h-5 w-5 mb-1" />
          <span className="text-xs">Agregar foto</span>
        </button>
      ) : (
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-2">
          {photos.map((p, idx) => {
            const visible = (p as any).visible_to_owner !== false;
            return (
              <div key={p.id} className="relative group">
                <button
                  type="button"
                  onClick={() => setLightboxIdx(idx)}
                  className={cn(
                    'block w-full aspect-square rounded-lg overflow-hidden border border-border/60',
                    !visible && 'opacity-40',
                  )}
                >
                  <img src={urlOf(p.id)} alt={p.caption ?? ''} className="w-full h-full object-cover" />
                </button>
                <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onToggleVisibility(p); }}
                    title={visible ? 'Ocultar al propietario' : 'Mostrar al propietario'}
                    className="p-1 rounded-md bg-background/90 hover:bg-background border border-border/60"
                  >
                    {visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3 text-muted-foreground" />}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(p.id); }}
                    title="Eliminar foto"
                    className="p-1 rounded-md bg-background/90 hover:bg-destructive hover:text-destructive-foreground border border-border/60"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                {p.caption && (
                  <p className="text-tiny text-muted-foreground mt-0.5 truncate">{p.caption}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Lightbox */}
      <Dialog open={lightboxIdx !== null} onOpenChange={(o) => { if (!o) setLightboxIdx(null); }}>
        <DialogContent className="max-w-4xl p-2">
          <DialogHeader>
            <DialogTitle className="text-caption">
              {featured && (
                <>Foto {(lightboxIdx ?? 0) + 1} de {photos.length}
                  {featured.caption && ` — ${featured.caption}`}
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          {featured && (
            <div className="relative">
              <img
                src={urlOf(featured.id)}
                alt={featured.caption ?? ''}
                className="w-full rounded-lg object-contain max-h-[75vh] bg-muted/30"
              />
              {photos.length > 1 && (
                <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 flex justify-between px-2">
                  <Button variant="secondary" size="icon" className="h-9 w-9 rounded-full"
                    onClick={() => setLightboxIdx((i) => (i! > 0 ? i! - 1 : photos.length - 1))}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="secondary" size="icon" className="h-9 w-9 rounded-full"
                    onClick={() => setLightboxIdx((i) => (i! < photos.length - 1 ? i! + 1 : 0))}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDeleteId !== null} onOpenChange={(o) => { if (!o) setConfirmDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar foto</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. La foto se eliminará del reporte.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const target = photos.find((p) => p.id === confirmDeleteId);
                if (target) void handleDelete(target);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}


// ─── Section Repairs Drawer (right side panel) ───────────
//
// Lifts the per-section repair editor out of the main scroll column.
// Each repair renders as a compact summary row by default; clicking it
// expands the full editor inline (accordion: only one open at a time).
// All write actions reuse the parent's existing handlers — no data model
// or save-flow changes.
interface SectionRepairsDrawerProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  section: InspectionSection;
  repairs: InspectionRepairItem[];
  hasContractor: boolean;
  expandedRepairId: string | null;
  onToggleExpand: (id: string) => void;
  onOpenCatalog: () => void;
  onUpdateRepair: (id: string, field: string, value: any) => void;
  onDeleteRepair: (id: string) => void;
}

function SectionRepairsDrawer({
  open, onOpenChange, section, repairs, hasContractor,
  expandedRepairId, onToggleExpand, onOpenCatalog, onUpdateRepair, onDeleteRepair,
}: SectionRepairsDrawerProps) {
  const subtotalClient = repairs
    .filter(r => r.visible_to_owner)
    .reduce((s, r) => s + r.quantity * r.unit_price, 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col p-0">
        <SheetHeader className="px-5 py-4 border-b">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Wrench className="h-4 w-4 text-muted-foreground" />
            Reparaciones
            <span className="text-xs font-normal text-muted-foreground">· {section.section_title}</span>
          </SheetTitle>
        </SheetHeader>

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
          <div className="flex items-center justify-between pb-2">
            <p className="text-xs text-muted-foreground">{repairs.length} reparaciones</p>
            <Button size="sm" onClick={onOpenCatalog} className="h-8 text-xs">
              <Plus className="mr-1 h-3.5 w-3.5" /> Agregar
            </Button>
          </div>

          {repairs.length === 0 && (
            <p className="text-caption text-muted-foreground text-center py-8">
              Sin reparaciones en esta sección
            </p>
          )}

          {repairs.map((repair) => {
            const expanded = expandedRepairId === repair.id;
            const itemSubtotal = repair.quantity * repair.unit_price;
            return (
              <div key={repair.id} className={cn(
                'rounded-md border bg-card transition-colors',
                !repair.visible_to_owner ? 'opacity-60 border-dashed border-border/60' : 'border-border/60',
                expanded && 'ring-1 ring-primary/30'
              )}>
                {/* Compact summary row (always visible) */}
                <button
                  type="button"
                  onClick={() => onToggleExpand(repair.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/30 transition-colors"
                >
                  <ChevronRight className={cn(
                    'h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform',
                    expanded && 'rotate-90'
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{repair.title_snapshot}</p>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <span>{repair.payer_role === 'tenant' ? 'Inquilino' : 'Propietario'}</span>
                      <span className="opacity-50">·</span>
                      <span>{repair.payment_nature === 'optional' ? 'Opcional' : 'Obligatoria'}</span>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-medium shrink-0">{fmtCurrency(itemSubtotal)}</span>
                </button>

                {/* Expanded editor */}
                {expanded && (
                  <div className="px-3 pb-3 pt-1 space-y-2.5 border-t border-border/70">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        {repair.category_snapshot && (
                          <p className="text-xs text-muted-foreground">{repair.category_snapshot}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); onUpdateRepair(repair.id, 'visible_to_owner', !repair.visible_to_owner); }}
                          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                          title={repair.visible_to_owner ? 'Visible al propietario' : 'Oculta al propietario'}
                        >
                          {repair.visible_to_owner ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); onDeleteRepair(repair.id); }}
                          className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <Textarea rows={1} className="text-xs min-h-[36px] resize-none"
                      placeholder="Descripción de reparación..."
                      onBlur={(e) => onUpdateRepair(repair.id, 'description_snapshot', e.target.value || null)}
                      defaultValue={repair.description_snapshot ?? ''}
                      key={`desc-${repair.id}`}
                    />

                    <div className={cn('grid gap-2', hasContractor ? 'grid-cols-5' : 'grid-cols-3')}>
                      <div>
                        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5 block">Cantidad</Label>
                        <NumberInput value={repair.quantity}
                          onChange={(v) => onUpdateRepair(repair.id, 'quantity', v)}
                          className="h-8 text-xs font-mono" />
                      </div>
                      <div>
                        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5 block">Cliente</Label>
                        <NumberInput value={repair.unit_price}
                          onChange={(v) => onUpdateRepair(repair.id, 'unit_price', v)}
                          className="h-8 text-xs font-mono" />
                      </div>
                      {hasContractor && (
                        <div>
                          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5 block">Contratista</Label>
                          <NumberInput value={(repair as any).contractor_unit_price ?? 0}
                            onChange={(v) => onUpdateRepair(repair.id, 'contractor_unit_price', v)}
                            className="h-8 text-xs font-mono" />
                        </div>
                      )}
                      <div>
                        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5 block">Subtotal</Label>
                        <p className="h-8 flex items-center justify-end text-xs font-mono font-medium">
                          {fmtCurrency(itemSubtotal)}
                        </p>
                      </div>
                      {hasContractor && (
                        <div>
                          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5 block">Utilidad</Label>
                          <p className="h-8 flex items-center justify-end text-xs font-mono text-muted-foreground">
                            {fmtCurrency((repair.unit_price - ((repair as any).contractor_unit_price ?? 0)) * repair.quantity)}
                          </p>
                        </div>
                      )}
                    </div>

                    <Input placeholder="Notas..." defaultValue={repair.notes ?? ''} className="h-8 text-xs"
                      onBlur={(e) => onUpdateRepair(repair.id, 'notes', e.target.value || null)} />

                    <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border/70">
                      <div className="space-y-1">
                        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Paga</Label>
                        <ToggleGroup
                          type="single"
                          value={repair.payer_role}
                          onValueChange={(v) => v && onUpdateRepair(repair.id, 'payer_role', v)}
                          className="gap-0 rounded-md border border-border bg-muted/30 p-0.5"
                        >
                          <ToggleGroupItem
                            value="tenant"
                            className="h-8 px-3 text-xs font-medium rounded-sm data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-sm"
                          >
                            Inquilino
                          </ToggleGroupItem>
                          <ToggleGroupItem
                            value="owner"
                            className="h-8 px-3 text-xs font-medium rounded-sm data-[state=on]:bg-[hsl(var(--status-good))] data-[state=on]:text-white data-[state=on]:shadow-sm"

                          >
                            Propietario
                          </ToggleGroupItem>
                        </ToggleGroup>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Tipo</Label>
                        <ToggleGroup
                          type="single"
                          value={repair.payment_nature}
                          onValueChange={(v) => v && onUpdateRepair(repair.id, 'payment_nature', v)}
                          className="gap-0 rounded-md border border-border bg-muted/30 p-0.5"
                        >
                          <ToggleGroupItem
                            value="required"
                            className="h-8 px-3 text-xs font-medium rounded-sm data-[state=on]:bg-foreground data-[state=on]:text-background"
                          >
                            Obligatoria
                          </ToggleGroupItem>
                          <ToggleGroupItem
                            value="optional"
                            className="h-8 px-3 text-xs font-medium rounded-sm data-[state=on]:bg-foreground data-[state=on]:text-background"
                          >
                            Opcional
                          </ToggleGroupItem>
                        </ToggleGroup>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Sticky footer */}
        <div className="border-t px-5 py-3 flex items-center justify-between bg-card">
          <span className="text-xs text-muted-foreground">Subtotal cliente</span>
          <span className="text-sm font-mono font-semibold">{fmtCurrency(subtotalClient)}</span>
        </div>
      </SheetContent>
    </Sheet>
  );
}
