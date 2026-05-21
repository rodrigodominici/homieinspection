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
import type { InspectionPhoto } from '@/lib/types';
import { QuotationDialog } from '@/components/QuotationDialog';
import { useReviewDetail, useReviewActions } from '@/modules/review/api';
import {
  PublishedUrlsDialog,
  MissingObservationsDialog,
  RepairCatalogSheet,
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
        onContractorChange={actions.handleContractorChange}
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

