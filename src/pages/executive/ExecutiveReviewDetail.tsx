import ExecutiveLayout from '@/components/ExecutiveLayout';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { calculateProgress, getEffectiveSnapshot } from '@/lib/inspection-utils';
import { requiresFinalObservation } from '@/lib/section-completion';
import { useSignedPhotoUrls } from '@/lib/photo-urls';
import type { InspectionPhoto, RepairCatalogItem } from '@/lib/types';
import { QuotationDialog } from '@/components/QuotationDialog';
import {
  useReviewDetail,
  repairsService,
  inspectionActions,
} from '@/modules/review/api';
import {
  PublishedUrlsDialog,
  MissingObservationsDialog,
  RepairCatalogSheet,
  type PublishedUrls,
} from '@/modules/review/components';
import {
  SectionWorkspace,
  PhotoPanel,
  SectionRepairsDrawer,
  ReviewHeaderBar,
  SectionSidebar,
  SubmittedBanner,
  MobileReviewView,
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


  // ─── RENDER ────────────────────────────────────────────
  return (
    <ExecutiveLayout>
    <div className="min-h-[calc(100vh-3.5rem)] bg-muted/30">
      <ReviewHeaderBar
        inspection={inspection}
        sections={sections}
        operationalSections={operationalSections}
        activeSectionId={activeSectionId}
        setActiveSectionId={setActiveSectionId}
        repairsBySection={repairsBySection}
        allRepairs={allRepairs}
        budgetBreakdown={budgetBreakdown}
        warrantyDeposit={warrantyDeposit}
        depositDiff={depositDiff}
        contractorTotal={contractorTotal}
        utility={utility}
        contractors={contractors}
        selectedContractorId={selectedContractorId}
        onContractorChange={handleContractorChange}
        inspectorProgressLabel={inspectorProgressLabel}
        progress={progress}
        lastActiveRelative={lastActiveRelative}
        isPublished={isPublished}
        returnMode={returnMode}
        setReturnMode={setReturnMode}
        selectedReturnSections={selectedReturnSections}
        submitting={submitting}
        showObservationWarnings={showObservationWarnings}
        missingSections={missingSections}
        onBack={() => navigate('/executive')}
        onApprove={handleApprove}
        onPublish={handlePublish}
        onReturnForChanges={handleReturnForChanges}
        onOpenQuotation={(payer) => setQuotationDialog({ open: true, payer })}
        onOpenRepairsDrawer={(sid) => { setExpandedRepairId(null); setRepairsDrawerSectionId(sid); }}
        onCopyLink={() => {
          const url = `${window.location.origin}/reportes/${inspection.property_id}`;
          navigator.clipboard.writeText(url);
          toast({ title: 'Link copiado' });
        }}
        onOpenPublished={() => window.open(`/reportes/${inspection.property_id}`, '_blank')}
      />

      {inspection.status === 'submitted' && (
        <SubmittedBanner submitting={submitting} onStartReview={handleStartReview} />
      )}

      {/* ── DESKTOP: 3-column layout ──────────────────── */}
      <div className="hidden lg:grid lg:grid-cols-[240px_1fr_300px] h-[calc(100vh-7rem)]">
        <SectionSidebar
          operationalSections={operationalSections}
          activeSectionId={activeSectionId}
          onSelectSection={setActiveSectionId}
          repairsBySection={repairsBySection}
          signatureRecord={signatureRecord}
          missingSections={missingSections}
          showObservationWarnings={showObservationWarnings}
        />

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
        </aside>
      </div>

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
        onOpenCatalog={openCatalog}
        onOpenRepairsDrawer={(sid) => { setExpandedRepairId(null); setRepairsDrawerSectionId(sid); }}
        onPublish={() => handlePublish()}
      />


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

