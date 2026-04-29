import ExecutiveLayout from '@/components/ExecutiveLayout';
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
import { useSignedPhotoUrls } from '@/lib/photo-urls';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type {
  Inspection, InspectionSection, InspectionFieldValue, InspectionPhoto,
  InspectionRepairItem, RepairCatalogItem, InspectionReview, Contractor,
} from '@/lib/types';
import {
  ArrowLeft, CheckCircle2, RotateCcw, MapPin, Building, Plus, Trash2,
  Eye, EyeOff, Send, Link2, Copy, DollarSign, Search, PenLine, XCircle,
  AlertTriangle, ExternalLink, RefreshCw, Clock, Camera, Wrench,
  ChevronLeft, ChevronRight, ChevronDown, ZoomIn, FileText,
} from 'lucide-react';
import { QuotationDialog } from '@/components/QuotationDialog';
import { cn } from '@/lib/utils';
import { emitCommunicationEvent } from '@/lib/communications/emit';
import { COMMUNICATION_EVENTS } from '@/lib/communications/events';
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
  const allPhotos = useMemo(() => Object.values(photosBySection).flat(), [photosBySection]);
  const urlOf = useSignedPhotoUrls(allPhotos);
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
  const [publishedUrls, setPublishedUrls] = useState<{ owner: string; tenant: string } | null>(null);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [quotationDialog, setQuotationDialog] = useState<{ open: boolean; payer: 'owner' | 'tenant' }>({ open: false, payer: 'owner' });

  // Signature
  const [signatureRecord, setSignatureRecord] = useState<{
    signature_status: string; signer_name: string | null; skip_reason: string | null;
  } | null>(null);

  // Contractors
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [selectedContractorId, setSelectedContractorId] = useState<string | null>(null);

  // Repairs side drawer (desktop). Holds the section id whose repairs are open.
  const [repairsDrawerSectionId, setRepairsDrawerSectionId] = useState<string | null>(null);
  // Which repair row inside the drawer is expanded for editing (accordion).
  const [expandedRepairId, setExpandedRepairId] = useState<string | null>(null);

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

  // Internal operational breakdown — aggregates ALL repair items regardless of visible_to_owner.
  // visible_to_owner only gates the published owner-facing payload (clientTotal below).
  const budgetBreakdown = useMemo(() => {
    const acc = { ownerRequired: 0, ownerOptional: 0, tenantRequired: 0, tenantOptional: 0 };
    for (const r of allRepairs) {
      const amount = (Number(r.quantity) || 0) * (Number(r.unit_price) || 0);
      if (r.payer_role === 'tenant') {
        if (r.payment_nature === 'optional') acc.tenantOptional += amount;
        else acc.tenantRequired += amount;
      } else {
        if (r.payment_nature === 'optional') acc.ownerOptional += amount;
        else acc.ownerRequired += amount;
      }
    }
    return {
      ...acc,
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

    // Look up contractor-specific price if a contractor is selected
    let contractorPrice = 0;
    let priceSource: 'catalog' | 'none' = 'none';
    if (selectedContractorId) {
      const { data: cpData } = await supabase
        .from('repair_catalog_item_contractor_prices')
        .select('price')
        .eq('repair_catalog_item_id', catalogItem.id)
        .eq('contractor_id', selectedContractorId)
        .maybeSingle();
      if (cpData) {
        contractorPrice = Number(cpData.price);
        priceSource = 'catalog';
      }
    }

    await supabase.from('inspection_repair_items').insert({
      inspection_id: id!, inspection_section_id: catalogSectionId,
      repair_catalog_item_id: catalogItem.id, title_snapshot: catalogItem.name,
      owner_friendly_name_snapshot: catalogItem.owner_friendly_name,
      description_snapshot: catalogItem.description,
      category_snapshot: catalogItem.category?.name ?? null,
      unit: catalogItem.unit, pricing_type: catalogItem.pricing_type,
      quantity: 1, unit_price: catalogItem.base_price, contractor_unit_price: contractorPrice,
      notes: null, visible_to_owner: true, sort_order: existingRepairs.length,
      payer_role: 'owner', payment_nature: 'required',
      created_by: profile?.id, updated_by: profile?.id,
    });
    setCatalogOpen(false);
    const { data } = await supabase.from('inspection_repair_items').select('*').eq('inspection_id', id!).order('sort_order');
    setRepairsBySection(groupBy((data ?? []) as unknown as InspectionRepairItem[]));
    toast({
      title: 'Reparación agregada',
      description: priceSource === 'catalog'
        ? `Precio contratista autollenado: $${contractorPrice}`
        : selectedContractorId ? 'Sin precio de contratista configurado' : undefined,
    });
  };

  const updateRepairItem = async (repairId: string, field: string, value: any) => {
    await supabase.from('inspection_repair_items').update({ [field]: value, updated_by: profile?.id } as any).eq('id', repairId);
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
        property_type: inspection.property_type,
        inspection_type: inspection.inspection_type,
      },
      sections: operationalSections.map((s) => ({
        id: s.id, title: s.section_title, type: s.section_type,
        final_observation: finalObservations[s.id]?.trim() || null,
        photos: visiblePhotos.filter((p) => p.inspection_section_id === s.id)
          .map((p) => ({ id: p.id, url: null, caption: p.caption })),
        repairs: visibleRepairs.filter((r) => r.inspection_section_id === s.id)
          .map((r) => ({
            name: r.owner_friendly_name_snapshot || r.title_snapshot,
            description: r.description_snapshot, category: r.category_snapshot,
            unit: r.unit, quantity: r.quantity, unit_price: r.unit_price,
            subtotal: r.quantity * r.unit_price,
            payer_role: r.payer_role, payment_nature: r.payment_nature,
          })),
      })),
      budget_total: clientTotal,
      published_at: new Date().toISOString(),
    };
    const { data: existing } = await supabase
      .from('inspection_report_versions').select('version_number')
      .eq('inspection_id', id!).order('version_number', { ascending: false }).limit(1);
    const nextVersion = ((existing?.[0] as any)?.version_number ?? 0) + 1;

    // Atomic-in-practice publish:
    // 1) unset previous latest rows (covers all prior audiences)
    // 2) insert owner row + tenant row in a single .insert([...]) call
    //    sharing version_number and payload — only public_token + audience differ.
    // The shared payload already carries `payer_role` + `payment_nature` per repair,
    // and is filtered by `visible_to_owner` (editorial gate, NOT a payer gate).
    // The audience-aware public renderer applies payer filtering at render time.
    await supabase.from('inspection_report_versions').update({ is_latest: false }).eq('inspection_id', id!);

    const ownerToken = crypto.randomUUID();
    const tenantToken = crypto.randomUUID();
    const { error } = await supabase.from('inspection_report_versions').insert([
      { inspection_id: id!, version_number: nextVersion, status: 'published',
        audience: 'owner',  public_token: ownerToken,  normalized_payload: payload as any, is_latest: true },
      { inspection_id: id!, version_number: nextVersion, status: 'published',
        audience: 'tenant', public_token: tenantToken, normalized_payload: payload as any, is_latest: true },
    ]);
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
    const origin = window.location.origin;
    setPublishedUrls({
      owner: `${origin}/reportes/${inspection.property_id}/${ownerToken}`,
      tenant: `${origin}/reportes/${inspection.property_id}/${tenantToken}`,
    });
    // Fire system events for the Communications module (fire-and-forget).
    emitCommunicationEvent({
      eventName: COMMUNICATION_EVENTS.INSPECTION_PUBLISHED_OWNER,
      inspectionId: id!,
      payload: { version_number: nextVersion, public_url: `${origin}/reportes/${inspection.property_id}/${ownerToken}` },
    });
    emitCommunicationEvent({
      eventName: COMMUNICATION_EVENTS.INSPECTION_PUBLISHED_TENANT,
      inspectionId: id!,
      payload: { version_number: nextVersion, public_url: `${origin}/reportes/${inspection.property_id}/${tenantToken}` },
    });
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
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" className="bg-[hsl(var(--status-good))] hover:bg-[hsl(var(--status-good))]/90" disabled={submitting}>
                        <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Aprobar
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
              {isPublished ? (
                <Button size="sm" variant="outline" onClick={handlePublish} disabled={submitting}>
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Republicar
                </Button>
              ) : ['submitted', 'in_review', 'approved'].includes(inspection.status) ? (
                <Button size="sm" onClick={handlePublish} disabled={submitting}>
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
            {/* Propietario */}
            <div className="shrink-0 rounded-md bg-muted/40 px-3 py-1.5 min-w-[120px]">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Propietario</p>
              <p className="text-sm font-mono font-semibold">{fmtCurrency(budgetBreakdown.ownerRequired)}</p>
              {budgetBreakdown.ownerOptional > 0 && (
                <p className="text-[10px] text-muted-foreground font-mono">+Opc {fmtCurrency(budgetBreakdown.ownerOptional)}</p>
              )}
            </div>
            {/* Inquilino */}
            <div className="shrink-0 rounded-md bg-muted/40 px-3 py-1.5 min-w-[120px]">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Inquilino</p>
              <p className="text-sm font-mono font-semibold">{fmtCurrency(budgetBreakdown.tenantRequired)}</p>
              {budgetBreakdown.tenantOptional > 0 && (
                <p className="text-[10px] text-muted-foreground font-mono">+Opc {fmtCurrency(budgetBreakdown.tenantOptional)}</p>
              )}
            </div>
            {/* Total general — single strong emphasis */}
            <div className="shrink-0 rounded-md bg-primary/10 px-3 py-1.5 min-w-[130px]">
              <p className="text-[10px] uppercase tracking-wide text-primary/70">Total general</p>
              <p className="text-sm font-mono font-semibold text-primary">{fmtCurrency(budgetBreakdown.grandTotal)}</p>
              {warrantyDeposit !== null && budgetBreakdown.ownerRequired > 0 && (
                <p className={cn('text-[10px] font-mono', depositDiff! >= 0 ? 'text-[hsl(var(--status-good))]' : 'text-[hsl(var(--status-bad))]')}>
                  vs depósito {depositDiff! >= 0 ? '+' : ''}{fmtCurrency(depositDiff!)}
                </p>
              )}
            </div>

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

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground hover:text-foreground max-w-[200px]">
                    <Wrench className="mr-1 h-3.5 w-3.5 shrink-0" />
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
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Contratista</Label>
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
                    <div className="space-y-1 pt-2 border-t border-border/40 text-xs">
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


      {/* ── DESKTOP: 3-column layout ──────────────────── */}
      <div className="hidden lg:grid lg:grid-cols-[240px_1fr_300px] h-[calc(100vh-7rem)]">
        {/* LEFT SIDEBAR: Section nav */}
        <aside className="border-r bg-card overflow-y-auto p-3 space-y-1">
          <p className="text-tiny font-medium text-muted-foreground uppercase tracking-wider px-2 mb-2">Secciones</p>
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
                  <span className="flex-1 truncate">{s.section_title}</span>
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
            onSaveFinalObs={() => saveFinalObservation(activeSection.id)}
            onSaveNote={() => saveInternalNote(activeSection.id)}
            savingField={savingField}
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
              onToggleVisibility={togglePhotoVisibility}
            />
          )}

          {/* Section-level subtotal — flat inline block */}
          {activeSection && (repairsBySection[activeSection.id] ?? []).length > 0 && (
            <div className="pt-3 border-t border-border/40 space-y-0.5">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Subtotal sección</p>
              <p className="text-sm font-mono font-semibold">
                {fmtCurrency((repairsBySection[activeSection.id] ?? []).filter(r => r.visible_to_owner).reduce((s, r) => s + r.quantity * r.unit_price, 0))}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {(repairsBySection[activeSection.id] ?? []).length} reparaciones
              </p>
            </div>
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
                        <img key={p.id} src={urlOf(p.id)} className="aspect-square rounded object-cover w-full" />
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

      {/* ── Published URL dialog (dual: owner + tenant) ──── */}
      <Dialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-[hsl(var(--status-good))]" /> Reporte publicado
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-caption text-muted-foreground">
              Se generaron dos enlaces. Comparte cada uno con la audiencia correspondiente.
            </p>

            {/* Owner link */}
            <div className="space-y-1.5">
              <label className="text-tiny font-semibold uppercase tracking-wide text-muted-foreground">Cotización Propietario</label>
              <div className="flex gap-2">
                <Input readOnly value={publishedUrls?.owner ?? ''} className="flex-1 text-caption font-mono" />
                <Button variant="outline" size="icon" onClick={() => publishedUrls && copyToClipboard(publishedUrls.owner)}>
                  <Copy className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={() => publishedUrls && window.open(publishedUrls.owner, '_blank')}>
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Tenant link */}
            <div className="space-y-1.5">
              <label className="text-tiny font-semibold uppercase tracking-wide text-muted-foreground">Cotización Inquilino</label>
              <div className="flex gap-2">
                <Input readOnly value={publishedUrls?.tenant ?? ''} className="flex-1 text-caption font-mono" />
                <Button variant="outline" size="icon" onClick={() => publishedUrls && copyToClipboard(publishedUrls.tenant)}>
                  <Copy className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={() => publishedUrls && window.open(publishedUrls.tenant, '_blank')}>
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setPublishDialogOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
  onSaveFinalObs: () => void;
  onSaveNote: () => void;
  savingField: string | null;
  onOpenRepairsDrawer: () => void;
  returnMode: boolean;
  returnSelected: boolean;
  onToggleReturn: () => void;
  returnComment: string;
  onReturnCommentChange: (v: string) => void;
}

function SectionWorkspace({
  section, fields, repairs, inspectorObs, finalObservation, internalNote,
  onFinalObsChange, onInternalNoteChange, onSaveFinalObs, onSaveNote,
  savingField, onOpenRepairsDrawer,
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

      {/* Compact repairs strip — replaces the old bottom-of-section card.
          Click to open the right-side repairs drawer. */}
      <button
        type="button"
        onClick={onOpenRepairsDrawer}
        className="w-full flex items-center gap-3 rounded-md border border-border/60 bg-background/60 px-3 py-2 hover:bg-muted/40 hover:border-border transition-colors text-left group"
      >
        <Wrench className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm font-medium">Reparaciones</span>
          <span className="text-xs text-muted-foreground">· {repairs.length}</span>
        </div>
        <div className="flex-1" />
        {sectionSubtotalClient > 0 && (
          <span className="text-xs font-mono text-muted-foreground">
            Subtotal {fmtCurrency(sectionSubtotalClient)}
          </span>
        )}
        <span className="text-xs text-primary font-medium inline-flex items-center gap-0.5 group-hover:underline">
          Editar <ChevronRight className="h-3.5 w-3.5" />
        </span>
      </button>

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

      {/* Side-by-side observations — neutral containers */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-border/60 p-3 space-y-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Observación del Inspector</p>
          <p className="text-caption whitespace-pre-wrap">{inspectorObs || <span className="text-muted-foreground italic">Sin observación</span>}</p>
        </div>
        <div className="rounded-lg border border-border/60 p-3 space-y-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            Observación Final <span className="text-[10px] text-muted-foreground normal-case tracking-normal">· Pública</span>
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
      <div className="space-y-1.5">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Comentario Interno</p>
        <Textarea value={internalNote} rows={2} className="text-caption"
          placeholder="Nota interna (no visible al propietario)..."
          onChange={(e) => onInternalNoteChange(e.target.value)} />
        <Button size="sm" variant="outline" onClick={onSaveNote}
          disabled={savingField === section.id + '-note'} className="h-7 text-tiny">
          Guardar nota
        </Button>
      </div>

      {/* Repairs are edited in the right-side `SectionRepairsDrawer`,
          opened from the compact strip near the section title above. */}

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
  const urlOf = useSignedPhotoUrls(photos);

  const featured = photos[featuredIdx] ?? null;
  const hasManyPhotos = photos.length > 4;

  if (photos.length === 0) {
    return (
      <div>
        <p className="text-xs text-muted-foreground mb-2">Fotos · 0</p>
        <p className="text-tiny text-muted-foreground py-4 text-center">Sin fotos</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-2">
        Fotos · {photos.length}
      </p>

      {hasManyPhotos ? (
        <>
          {/* Featured preview */}
          {featured && (
            <div className="relative group mb-2">
              <img src={urlOf(featured.id)} alt={featured.caption ?? ''}
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
                className={cn('shrink-0 rounded-md overflow-hidden border transition-all',
                  idx === featuredIdx ? 'border-primary' : 'border-transparent hover:border-border',
                  (p as any).visible_to_owner === false && 'opacity-40'
                )}>
                <img src={urlOf(p.id)} alt="" className="h-12 w-12 object-cover" />
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
                <img src={urlOf(p.id)} alt={p.caption ?? ''}
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
              <img src={urlOf(featured.id)} alt={featured.caption ?? ''}
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
                  <div className="px-3 pb-3 pt-1 space-y-2.5 border-t border-border/40">
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
                        <Input type="number" step="0.01" value={repair.quantity}
                          onChange={(e) => onUpdateRepair(repair.id, 'quantity', parseFloat(e.target.value) || 0)}
                          className="h-8 text-xs font-mono" />
                      </div>
                      <div>
                        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5 block">Cliente</Label>
                        <Input type="number" step="1" value={repair.unit_price}
                          onChange={(e) => onUpdateRepair(repair.id, 'unit_price', parseFloat(e.target.value) || 0)}
                          className="h-8 text-xs font-mono" />
                      </div>
                      {hasContractor && (
                        <div>
                          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5 block">Contratista</Label>
                          <Input type="number" step="1" value={(repair as any).contractor_unit_price ?? 0}
                            onChange={(e) => onUpdateRepair(repair.id, 'contractor_unit_price', parseFloat(e.target.value) || 0)}
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

                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/40">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button type="button"
                            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 cursor-pointer transition-colors">
                            {repair.payer_role === 'tenant' ? 'Inquilino' : 'Propietario'}
                            <ChevronDown className="h-3 w-3 opacity-60" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-36">
                          <DropdownMenuItem onClick={() => onUpdateRepair(repair.id, 'payer_role', 'owner')}>Propietario</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onUpdateRepair(repair.id, 'payer_role', 'tenant')}>Inquilino</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <span className="text-muted-foreground/50 text-xs">·</span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button type="button"
                            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 cursor-pointer transition-colors">
                            {repair.payment_nature === 'optional' ? 'Opcional' : 'Obligatoria'}
                            <ChevronDown className="h-3 w-3 opacity-60" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-36">
                          <DropdownMenuItem onClick={() => onUpdateRepair(repair.id, 'payment_nature', 'required')}>Obligatoria</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onUpdateRepair(repair.id, 'payment_nature', 'optional')}>Opcional</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
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
