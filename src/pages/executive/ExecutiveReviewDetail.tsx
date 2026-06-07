import ExecutiveLayout from '@/components/ExecutiveLayout';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { calculateProgress, getEffectiveSnapshot, isRepairableSection } from '@/lib/inspection-utils';
import { requiresFinalObservation } from '@/lib/section-completion';
import { useSignedPhotoUrls } from '@/lib/photo-urls';
import type { InspectionPhoto } from '@/lib/types';
import { QuotationDialog } from '@/components/QuotationDialog';
import { ContractorQuotationDialog } from '@/components/ContractorQuotationDialog';
import { WorkOrderDetailsDialog } from '@/components/WorkOrderDetailsDialog';
import { useReviewDetail, useReviewActions, useOwnerFeedbackByRepair } from '@/modules/review/api';
import { useQuotationDiscount } from '@/modules/review/api/useQuotationDiscount';
import { applyQuotationDiscount, type QuotationDiscountInput } from '@/lib/quotation-discount';
import { fetchTaxConfig, type MarketTaxSettings } from '@/lib/tax';
import {
  PublishedUrlsDialog,
  MissingObservationsDialog,
  RepairCatalogSheet,
} from '@/modules/review/components';
import {
  SectionWorkspace,
  PhotoPanel,
  SectionRepairsDrawer,
  SectionRepairsPanel,
  SectionSidebar,
  SubmittedBanner,
  MobileReviewView,
  WorkflowStepper,
  PropertyContextBar,
  PendingDecisionsBanner,
  RepairsTableView,
  QuotationView,
  QuotationDiscountSheet,
  PublishView,
  type ReviewMode,
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

  // Feedback del propietario sobre la última versión publicada (mapeado por repair_id).
  const ownerFeedback = useOwnerFeedbackByRepair(id);

  // Active section for desktop
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);

  // Editing state (local textareas; autosaved silently)
  const [internalNotes, setInternalNotes] = useState<Record<string, string>>({});
  const [finalObservations, setFinalObservations] = useState<Record<string, string>>({});

  // Return mode
  const [returnMode, setReturnMode] = useState(false);
  const [returnComments, setReturnComments] = useState<Record<string, string>>({});
  const [selectedReturnSections, setSelectedReturnSections] = useState<Set<string>>(new Set());

  // Quotation dialog
  const [quotationDialog, setQuotationDialog] = useState<{ open: boolean; payer: 'owner' | 'tenant' }>({ open: false, payer: 'owner' });
  const [contractorQuotationOpen, setContractorQuotationOpen] = useState(false);
  const [workOrderDetailsOpen, setWorkOrderDetailsOpen] = useState(false);

  // Contractors (selection is local UI state; data comes from the hook)
  const [selectedContractorId, setSelectedContractorId] = useState<string | null>(null);

  // Quotation discount sheet
  const [discountSheetOpen, setDiscountSheetOpen] = useState(false);

  // Workflow mode (top-rail stepper drives the rendered view).
  const [mode, setMode] = useState<ReviewMode>('inspection');

  // Repairs side drawer (desktop). Holds the section id whose repairs are open.
  const [repairsDrawerSectionId, setRepairsDrawerSectionId] = useState<string | null>(null);
  // Which repair row inside the drawer is expanded for editing (accordion).
  const [expandedRepairId, setExpandedRepairId] = useState<string | null>(null);

  // Track desktop (>= lg / 1024) so the repairs panel renders inline on
  // desktop and as a Sheet on mobile/tablet — not both at once.
  const [isDesktop, setIsDesktop] = useState<boolean>(
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : true,
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);


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
    const firstOp = sections.find(isRepairableSection);
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

  // Tax config for the inspection market (loaded once, cached in tax.ts).
  const [taxConfig, setTaxConfig] = useState<MarketTaxSettings | null>(null);
  useEffect(() => {
    if (!inspection?.market) return;
    fetchTaxConfig(inspection.market).then(setTaxConfig).catch(() => setTaxConfig(null));
  }, [inspection?.market]);

  // Active quotation discount.
  const discountState = useQuotationDiscount(id, profile?.id);
  const activeDiscountInput: QuotationDiscountInput | null = useMemo(
    () => discountState.discount
      ? { type: discountState.discount.discount_type, value: Number(discountState.discount.discount_value), reason: discountState.discount.discount_reason }
      : null,
    [discountState.discount],
  );

  const discountBreakdown = useMemo(
    () => applyQuotationDiscount({
      subtotalOwner: budgetBreakdown.ownerTotal,
      subtotalTenant: budgetBreakdown.tenantTotal,
      discount: activeDiscountInput,
      taxConfig,
    }),
    [budgetBreakdown.ownerTotal, budgetBreakdown.tenantTotal, activeDiscountInput, taxConfig],
  );

  const effectiveSnapshot = inspection ? getEffectiveSnapshot(inspection) : {};
  const warrantyDeposit = typeof effectiveSnapshot.warranty_deposit === 'number' ? effectiveSnapshot.warranty_deposit : null;
  // Deposit comparison is rebased on owner-mandatory items only (the deposit-relevant universe).
  const depositDiff = warrantyDeposit !== null ? warrantyDeposit - budgetBreakdown.ownerRequired : null;

  const progress = useMemo(() => calculateProgress(sections), [sections]);

  const operationalSections = useMemo(
    () => sections.filter(isRepairableSection),
    [sections]
  );

  const metaSections = useMemo(
    () => sections.filter(s => !isRepairableSection(s)),
    [sections]
  );

  const missingSections = useMemo(
    () => operationalSections.filter(s => requiresFinalObservation(s.section_type) && !finalObservations[s.id]?.trim()),
    [operationalSections, finalObservations]
  );

  const showObservationWarnings = !['approved', 'published'].includes(inspection?.status ?? '');

  const activeSection = useMemo(
    () => sections.find(s => s.id === activeSectionId) ?? operationalSections[0] ?? null,
    [sections, operationalSections, activeSectionId]
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

  // ─── Actions hook (mutations + catalog/publish state) ───
  const actions = useReviewActions({
    id, profileId: profile?.id, inspection, operationalSections, allRepairs,
    repairsBySection, photosBySection, finalObservations, missingSections,
    clientTotal, selectedContractorId, setSelectedContractorId, refetch,
  });
  const { submitting, catalog, publish } = actions;

  const handleReturnForChanges = useCallback(
    () => actions.handleReturnForChanges(Array.from(selectedReturnSections), returnComments),
    [actions, selectedReturnSections, returnComments],
  );



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

  /** Fetches latest published tokens from DB for the given audiences. */
  const fetchPublishedUrls = useCallback(async () => {
    if (!inspection) return null;
    try {
      const { data } = await supabase
        .from('inspection_report_versions')
        .select('audience, public_token')
        .eq('inspection_id', inspection.id)
        .eq('is_latest', true);
      if (!data || data.length === 0) {
        toast({ title: 'No se encontró el reporte publicado', variant: 'destructive' });
        return null;
      }
      const origin = window.location.origin;
      const ownerRow = data.find((r: any) => r.audience === 'owner');
      const tenantRow = data.find((r: any) => r.audience === 'tenant');
      return {
        owner: ownerRow ? `${origin}/reportes/${inspection.property_id}/${ownerRow.public_token}` : '',
        tenant: tenantRow ? `${origin}/reportes/${inspection.property_id}/${tenantRow.public_token}` : '',
      };
    } catch {
      toast({ title: 'Error al obtener links', variant: 'destructive' });
      return null;
    }
  }, [inspection, toast]);

  const handleOpenOwner = useCallback(async () => {
    const urls = await fetchPublishedUrls();
    if (urls?.owner) window.open(urls.owner, '_blank');
  }, [fetchPublishedUrls]);

  const handleOpenTenant = useCallback(async () => {
    const urls = await fetchPublishedUrls();
    if (urls?.tenant) window.open(urls.tenant, '_blank');
  }, [fetchPublishedUrls]);

  const handleCopyOwner = useCallback(async () => {
    const urls = await fetchPublishedUrls();
    if (urls?.owner) {
      navigator.clipboard.writeText(urls.owner);
      toast({ title: 'Link propietario copiado' });
    }
  }, [fetchPublishedUrls, toast]);

  const handleCopyTenant = useCallback(async () => {
    const urls = await fetchPublishedUrls();
    if (urls?.tenant) {
      navigator.clipboard.writeText(urls.tenant);
      toast({ title: 'Link inquilino copiado' });
    }
  }, [fetchPublishedUrls, toast]);


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


  // ─── RENDER ────────────────────────────────────────────
  return (
    <ExecutiveLayout>
    <div className="min-h-[calc(100vh-3.5rem)] bg-muted/30">
      <WorkflowStepper
        inspection={inspection}
        mode={mode}
        onModeChange={setMode}
        onBack={() => navigate('/executive')}
        pendingDecisionsCount={showObservationWarnings ? missingSections.length : 0}
        repairsCount={allRepairs.length}
        grandTotal={budgetBreakdown.grandTotal}
        isPublished={isPublished}
        ownerFeedbackStatus={(inspection as any).owner_feedback_status}
      />

      {mode === 'inspection' && (
        <PropertyContextBar inspection={inspection} signatureRecord={signatureRecord} />
      )}

      {inspection.status === 'submitted' && (
        <SubmittedBanner submitting={submitting} onStartReview={actions.handleStartReview} />
      )}


      {/* ── DESKTOP per-mode rendering ─────────────────── */}
      {mode === 'inspection' && (() => {
        const drawerSection = sections.find(s => s.id === repairsDrawerSectionId) ?? null;
        const inlineRepairsOpen = !!drawerSection;
        const gridCols = inlineRepairsOpen
          ? 'lg:grid-cols-[240px_minmax(0,1fr)_minmax(400px,42%)]'
          : 'lg:grid-cols-[240px_1fr_300px]';

        const photosNode = activeSection ? (
          <PhotoPanel
            photos={photosBySection[activeSection.id] ?? []}
            inspectionId={id!}
            sectionId={activeSection.id}
            sectionKey={activeSection.section_key}
            uploadedBy={profile?.id}
            urlOf={urlOf}
            onToggleVisibility={actions.togglePhotoVisibility}
            onPhotosChanged={() => refetch()}
          />
        ) : null;

        return (
          <div className={`hidden lg:grid ${gridCols} h-[calc(100vh-7rem)]`}>
            <SectionSidebar
              operationalSections={operationalSections}
              activeSectionId={activeSectionId}
              onSelectSection={setActiveSectionId}
              repairsBySection={repairsBySection}
              missingSections={missingSections}
              showObservationWarnings={showObservationWarnings}
            />

            <main className="overflow-y-auto p-6 space-y-4">
              {showObservationWarnings && (
                <PendingDecisionsBanner
                  missingSections={missingSections}
                  onJumpToSection={setActiveSectionId}
                />
              )}
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
                photosSlot={inlineRepairsOpen ? photosNode : undefined}
              />}
            </main>

            {inlineRepairsOpen && drawerSection ? (
              <aside className="overflow-hidden">
                <SectionRepairsPanel
                  section={drawerSection}
                  repairs={repairsBySection[drawerSection.id] ?? []}
                  hasContractor={!!selectedContractorId}
                  expandedRepairId={expandedRepairId}
                  onToggleExpand={(rid) => setExpandedRepairId(prev => prev === rid ? null : rid)}
                  onOpenCatalog={() => actions.openCatalog(drawerSection.id)}
                  onUpdateRepair={actions.updateRepairItem}
                  onDeleteRepair={actions.deleteRepairItem}
                  onClose={() => setRepairsDrawerSectionId(null)}
                  variant="inline"
                  contractors={contractors}
                  selectedContractorId={selectedContractorId}
                  onContractorChange={actions.handleContractorChange}
                  contractorTotal={contractorTotal}
                  utility={utility}
                  feedbackByRepairId={ownerFeedback.feedbackByRepairId}
                />
              </aside>
            ) : (
              <aside className="border-l bg-card overflow-y-auto p-4 space-y-4">
                {photosNode}
              </aside>
            )}
          </div>
        );
      })()}

      {mode === 'repairs' && (
        <div className="hidden lg:block h-[calc(100vh-7rem)]">
          <RepairsTableView
            sections={operationalSections}
            allRepairs={allRepairs}
            contractors={contractors}
            selectedContractorId={selectedContractorId}
            onContractorChange={actions.handleContractorChange}
            contractorTotal={contractorTotal}
            clientTotal={clientTotal}
            utility={utility}
            budgetBreakdown={budgetBreakdown}
            warrantyDeposit={warrantyDeposit}
            depositDiff={depositDiff}
            onOpenCatalog={actions.openCatalog}
            onUpdateRepair={actions.updateRepairItem}
            onDeleteRepair={actions.deleteRepairItem}
            feedbackByRepairId={ownerFeedback.feedbackByRepairId}
          />
        </div>
      )}

      {mode === 'quotation' && (
        <div className="hidden lg:block h-[calc(100vh-7rem)]">
          <QuotationView
            budgetBreakdown={budgetBreakdown}
            discountBreakdown={discountBreakdown}
            activeDiscount={activeDiscountInput}
            discountReason={discountState.discount?.discount_reason ?? null}
            onOpenDiscount={() => setDiscountSheetOpen(true)}
            onRemoveDiscount={async () => {
              try { await discountState.remove(); toast({ title: 'Descuento eliminado' }); }
              catch (e: any) { toast({ title: 'No se pudo eliminar', description: e?.message, variant: 'destructive' }); }
            }}
            discountSaving={discountState.saving}
            clientTotal={clientTotal}
            contractorTotal={contractorTotal}
            utility={utility}
            warrantyDeposit={warrantyDeposit}
            depositDiff={depositDiff}
            hasRepairs={allRepairs.length > 0}
            onOpenQuotation={(payer) => setQuotationDialog({ open: true, payer })}
            onOpenContractorQuotation={() => setContractorQuotationOpen(true)}
            onOpenWorkOrderDetails={() => setWorkOrderDetailsOpen(true)}
            onGoToRepairs={() => setMode('repairs')}
            onGoToPublish={() => setMode('publish')}
          />
        </div>
      )}

      {mode === 'publish' && (
        <div className="hidden lg:block h-[calc(100vh-7rem)]">
          <PublishView
            inspection={inspection}
            operationalSections={operationalSections}
            missingSections={showObservationWarnings ? missingSections : []}
            hasRepairs={allRepairs.length > 0}
            hasContractor={!!selectedContractorId}
            signatureRecord={signatureRecord}
            isPublished={isPublished}
            submitting={submitting}
            returnMode={returnMode}
            setReturnMode={setReturnMode}
            selectedReturnSectionsCount={selectedReturnSections.size}
            selectedReturnSections={selectedReturnSections}
            onReturnForChanges={handleReturnForChanges}
            onToggleReturnSection={toggleReturnSection}
            onApprove={actions.handleApprove}
            onPublish={actions.handlePublish}
            onOpenOwner={() => void handleOpenOwner()}
            onOpenTenant={() => void handleOpenTenant()}
            onCopyOwner={() => void handleCopyOwner()}
            onCopyTenant={() => void handleCopyTenant()}
            onGoToInspection={(sid) => { if (sid) setActiveSectionId(sid); setMode('inspection'); }}
            onGoToRepairs={() => setMode('repairs')}
          />
        </div>
      )}

      <MobileReviewView
        inspection={inspection}
        operationalSections={operationalSections}
        fieldsBySection={fieldsBySection}
        photosBySection={photosBySection}
        repairsBySection={repairsBySection}
        finalObservations={finalObservations}
        setFinalObservations={setFinalObservations}
        saveFinalObservationSilent={saveFinalObservationSilent}
        urlOf={urlOf}
        signatureRecord={signatureRecord}
        allRepairs={allRepairs}
        clientTotal={clientTotal}
        warrantyDeposit={warrantyDeposit}
        inspectorProgressLabel={inspectorProgressLabel}
        progress={progress}
        submitting={submitting}
        returnMode={returnMode}
        setReturnMode={setReturnMode}
        onOpenCatalog={actions.openCatalog}
        onOpenRepairsDrawer={(sid) => { setExpandedRepairId(null); setRepairsDrawerSectionId(sid); }}
        onPublish={() => actions.handlePublish()}
      />


      {/* ── Repairs drawer — MOBILE/TABLET ONLY (< lg). Desktop renders the
            inline panel inside the grid above. ── */}
      {!isDesktop && (() => {
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
            onOpenCatalog={() => actions.openCatalog(sec.id)}
            onUpdateRepair={actions.updateRepairItem}
            onDeleteRepair={actions.deleteRepairItem}
            contractors={contractors}
            selectedContractorId={selectedContractorId}
            onContractorChange={actions.handleContractorChange}
            contractorTotal={contractorTotal}
            utility={utility}
          />
        );
      })()}

      {/* ── Catalog sheet ──────────────────────────────── */}
      <RepairCatalogSheet
        open={catalog.open}
        onOpenChange={catalog.setOpen}
        search={catalog.search}
        onSearchChange={catalog.setSearch}
        items={catalog.items}
        onSelect={actions.addRepairFromCatalog}
      />

      {/* ── Published URL dialog (dual: owner + tenant) ──── */}
      <PublishedUrlsDialog
        open={publish.dialogOpen}
        onOpenChange={publish.setDialogOpen}
        urls={publish.urls}
        onCopy={copyToClipboard}
      />

      {/* ── Missing final observations confirm ────────── */}
      <MissingObservationsDialog
        open={publish.missingDialogOpen}
        onOpenChange={publish.setMissingDialogOpen}
        missingSections={missingSections}
        onConfirm={() => void actions.handlePublish(true)}
      />


      {/* ── Quotation dialog (owner / tenant) ─────────── */}
      <QuotationDialog
        open={quotationDialog.open}
        onOpenChange={(open) => setQuotationDialog((q) => ({ ...q, open }))}
        payer={quotationDialog.payer}
        inspection={inspection}
        repairs={allRepairs}
        operationalSections={operationalSections}
      />

      {/* ── Contractor quotation (confidential) ──────── */}
      <ContractorQuotationDialog
        open={contractorQuotationOpen}
        onOpenChange={setContractorQuotationOpen}
        inspection={inspection}
        operationalSections={operationalSections}
        allRepairs={allRepairs}
        contractorName={contractors.find(c => c.id === selectedContractorId)?.name ?? null}
      />

      {/* ── Work order details by category (confidential) ── */}
      <WorkOrderDetailsDialog
        open={workOrderDetailsOpen}
        onOpenChange={setWorkOrderDetailsOpen}
        inspection={inspection}
        allRepairs={allRepairs}
        contractorName={contractors.find(c => c.id === selectedContractorId)?.name ?? null}
      />

      {/* ── Quotation discount sheet ─────────────────── */}
      <QuotationDiscountSheet
        open={discountSheetOpen}
        onOpenChange={setDiscountSheetOpen}
        subtotalOwner={budgetBreakdown.ownerTotal}
        subtotalTenant={budgetBreakdown.tenantTotal}
        taxConfig={taxConfig}
        initial={activeDiscountInput}
        saving={discountState.saving}
        onSubmit={async (input) => {
          try {
            await discountState.apply(input);
            toast({ title: 'Descuento aplicado' });
          } catch (e: any) {
            toast({ title: 'No se pudo aplicar el descuento', description: e?.message, variant: 'destructive' });
          }
        }}
      />
    </div>
    </ExecutiveLayout>
  );
}

