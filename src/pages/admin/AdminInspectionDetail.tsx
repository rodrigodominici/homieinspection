import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Textarea } from '@/components/ui/textarea';
import { triggerKeyCollectionSync, syncCheckoutIfApplicable } from '@/lib/hubspot-sync';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { InspectionStatusBadge, SectionStatusBadge } from '@/components/StatusBadge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import AdminLayout from '@/components/AdminLayout';
import PropertyBriefingCard from '@/components/PropertyBriefingCard';
import { isSectionCompleted, requiresFinalObservation } from '@/lib/section-completion';
import { calculateProgress, getEffectiveSnapshot, isRepairableSection } from '@/lib/inspection-utils';
import { getContractDateShortLabel } from '@/lib/inspection-type-labels';
import { isAcceptedByOwner } from '@/lib/inspection-combined-status';
import { useSignedPhotoUrls } from '@/lib/photo-urls';
import type {
  Inspection, InspectionSection, InspectionFieldValue, InspectionPhoto,
  InspectionRepairItem, InspectionReportVersion, InspectionReview, Profile, WorkflowStage, RepairCatalogItem, InspectionSignature
} from '@/lib/types';
import {
  ArrowLeft, MapPin, Save, Check, Clock, ChevronDown, Copy,
  AlertTriangle, Package, Eye, EyeOff, History, FileText, Shield, DollarSign,
  ExternalLink, Share2, CheckCircle2, Link2, Trash2, Plus, Search, CalendarIcon, Send, Tag, Receipt,
} from 'lucide-react';
import { cn, groupBy } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

// Shared review/exec data hooks + components
import { useOwnerFeedbackByRepair } from '@/modules/review/api/useOwnerFeedbackByRepair';
import { useQuotationDiscount } from '@/modules/review/api/useQuotationDiscount';
import { applyQuotationDiscount, type QuotationDiscountInput } from '@/lib/quotation-discount';
import { fetchTaxConfig, type MarketTaxSettings } from '@/lib/tax';
import * as inspectionActionsService from '@/modules/review/api/inspection-actions.service';
import {
  PendingDecisionsBanner,
  RepairsTableView,
  QuotationView,
  QuotationDiscountSheet,
  PublishView,
} from '@/pages/executive/review-detail';
import { QuotationDialog } from '@/components/QuotationDialog';
import { ContractorQuotationDialog } from '@/components/ContractorQuotationDialog';
import { WorkOrderDetailsDialog } from '@/components/WorkOrderDetailsDialog';

/* ─── Workflow stages ─── */
const WORKFLOW_STAGES: { key: WorkflowStage; label: string; icon: React.ElementType }[] = [
  { key: 'inspection', label: 'Inspección', icon: Eye },
  { key: 'review', label: 'Revisión', icon: Shield },
  { key: 'budget', label: 'Presupuesto', icon: DollarSign },
  { key: 'share', label: 'Compartir', icon: Share2 },
];

const STAGE_ORDER: WorkflowStage[] = ['inspection', 'review', 'budget', 'share'];

function stageIndex(s: WorkflowStage) {
  return STAGE_ORDER.indexOf(s);
}

const ALL_STATUSES = [
  'pending_assignment', 'assigned', 'in_progress', 'submitted',
  'in_review', 'approved', 'published',
];

interface AuditLogEntry {
  id: string;
  inspection_id: string;
  previous_status: string | null;
  new_status: string | null;
  action: string;
  performed_by: string | null;
  note: string | null;
  created_at: string;
}


/* ─── Main component ─── */
export default function AdminInspectionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { profile } = useAuth();

  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [sections, setSections] = useState<InspectionSection[]>([]);
  const [fieldValues, setFieldValues] = useState<InspectionFieldValue[]>([]);
  const [photos, setPhotos] = useState<InspectionPhoto[]>([]);
  const urlOf = useSignedPhotoUrls(photos);
  const [repairItems, setRepairItems] = useState<InspectionRepairItem[]>([]);
  const [reportVersions, setReportVersions] = useState<InspectionReportVersion[]>([]);
  const [reviews, setReviews] = useState<InspectionReview[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [sourceEvent, setSourceEvent] = useState<Record<string, unknown> | null>(null);
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [signature, setSignature] = useState<InspectionSignature | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [photoLightbox, setPhotoLightbox] = useState<InspectionPhoto | null>(null);

  // Grouped data for review/budget tabs
  const [fieldsBySection, setFieldsBySection] = useState<Record<string, InspectionFieldValue[]>>({});
  const [photosBySection, setPhotosBySection] = useState<Record<string, InspectionPhoto[]>>({});
  const [reviewsBySection, setReviewsBySection] = useState<Record<string, InspectionReview[]>>({});
  const [repairsBySection, setRepairsBySection] = useState<Record<string, InspectionRepairItem[]>>({});

  // Editable fields
  const [editInspector, setEditInspector] = useState('');
  const [editExecutive, setEditExecutive] = useState('');
  

  // Force advance dialog
  const [forceStatusOpen, setForceStatusOpen] = useState(false);
  const [forceStatusValue, setForceStatusValue] = useState('');
  const [forceNote, setForceNote] = useState('');

  // Publish state
  const [publishing, setPublishing] = useState(false);

  // Delete state
  const [deleting, setDeleting] = useState(false);

  // Review/budget editing state (executive capabilities)
  const [internalNotes, setInternalNotes] = useState<Record<string, string>>({});
  const [finalObservations, setFinalObservations] = useState<Record<string, string>>({});
  const [savingField, setSavingField] = useState<string | null>(null);

  // Catalog drawer
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogItems, setCatalogItems] = useState<RepairCatalogItem[]>([]);
  const [catalogSectionId, setCatalogSectionId] = useState<string | null>(null);

  // Key collection date editor
  const [keyEditorOpen, setKeyEditorOpen] = useState(false);
  const [keyDateInput, setKeyDateInput] = useState<Date | undefined>();
  const [keyTimeInput, setKeyTimeInput] = useState('');
  const [savingKeyDate, setSavingKeyDate] = useState(false);
  const [resendingKeyDate, setResendingKeyDate] = useState(false);

  // Executive-aligned state (contractor, quotation, discount)
  const [contractors, setContractors] = useState<Array<{ id: string; name: string; country: string; is_active: boolean; created_at: string }>>([]);
  const [selectedContractorId, setSelectedContractorId] = useState<string | null>(null);
  const [quotationDialog, setQuotationDialog] = useState<{ open: boolean; payer: 'owner' | 'tenant' }>({ open: false, payer: 'owner' });
  const [contractorQuotationOpen, setContractorQuotationOpen] = useState(false);
  const [workOrderDetailsOpen, setWorkOrderDetailsOpen] = useState(false);
  const [discountSheetOpen, setDiscountSheetOpen] = useState(false);
  const [taxConfig, setTaxConfig] = useState<MarketTaxSettings | null>(null);
  const [activeTab, setActiveTab] = useState<string>('inspection');

  const fetchAll = useCallback(async () => {
    if (!id) return;
    const [inspRes, secRes, profilesRes, contractorRes] = await Promise.all([
      supabase.from('inspections').select(INSPECTION_DETAIL_COLUMNS).eq('id', id).single(),
      supabase.from('inspection_sections').select('*').eq('inspection_id', id).order('sort_order'),
      supabase.from('profiles').select('id, full_name, email, role, is_active, market, phone, country_code, approval_status, created_at, updated_at').eq('is_active', true).order('full_name'),
      supabase.from('contractors').select('*').eq('is_active', true).order('name'),
    ]);

    const insp = inspRes.data as unknown as Inspection;
    const secs = (secRes.data ?? []) as unknown as InspectionSection[];
    const profs = (profilesRes.data ?? []) as unknown as Profile[];
    setInspection(insp);
    setSections(secs);
    setAllProfiles(profs);
    setContractors((contractorRes.data ?? []) as any);
    setSelectedContractorId((insp as any)?.contractor_id ?? null);

    if (insp) {
      setEditInspector(insp.inspector_id ?? '');
      setEditExecutive(insp.executive_id ?? '');
      

      // Init final observations
      const obsMap: Record<string, string> = {};
      secs.forEach((s) => { obsMap[s.id] = s.final_observation ?? ''; });
      setFinalObservations(obsMap);

      const promises: Promise<void>[] = [];
      const secIds = secs.map(s => s.id);

      if (secs.length > 0) {
        promises.push(
          Promise.resolve(supabase.from('inspection_field_values').select('*').eq('inspection_id', id).order('sort_order'))
            .then(r => {
              const fvs = (r.data ?? []) as unknown as InspectionFieldValue[];
              setFieldValues(fvs);
              setFieldsBySection(groupBy(fvs));
            }),
          Promise.resolve(supabase.from('inspection_photos').select('*').eq('inspection_id', id).order('sort_order'))
            .then(r => {
              const ps = (r.data ?? []) as unknown as InspectionPhoto[];
              setPhotos(ps);
              setPhotosBySection(groupBy(ps));
            }),
          Promise.resolve(supabase.from('inspection_reviews').select('*').eq('inspection_id', id).order('created_at', { ascending: false }))
            .then(r => {
              const rvs = (r.data ?? []) as unknown as InspectionReview[];
              setReviews(rvs);
              setReviewsBySection(groupBy(rvs));
              // Init internal notes
              const notesMap: Record<string, string> = {};
              for (const rv of rvs) {
                if (rv.comment_type === 'internal_note' && !notesMap[rv.inspection_section_id]) {
                  notesMap[rv.inspection_section_id] = rv.comment;
                }
              }
              setInternalNotes(notesMap);
            }),
        );
      }

      promises.push(
        Promise.resolve(supabase.from('inspection_repair_items').select('*').eq('inspection_id', id).order('sort_order'))
          .then(r => {
            const rps = (r.data ?? []) as unknown as InspectionRepairItem[];
            setRepairItems(rps);
            setRepairsBySection(groupBy(rps));
          }),
        Promise.resolve(supabase.from('inspection_report_versions').select('id, inspection_id, version_number, status, public_token, audience, is_latest, created_at, published_by, owner_decision_summary_json').eq('inspection_id', id).order('version_number', { ascending: false }))
          .then(r => { setReportVersions((r.data ?? []) as unknown as InspectionReportVersion[]); }),
        Promise.resolve(supabase.from('inspection_audit_log').select('*').eq('inspection_id', id).order('created_at', { ascending: false }))
          .then(r => { setAuditLog((r.data ?? []) as unknown as AuditLogEntry[]); }),
        Promise.resolve(supabase.from('inspection_signatures').select('*').eq('inspection_id', id).order('created_at', { ascending: false }).limit(1))
          .then(r => { setSignature((r.data?.[0] as unknown as InspectionSignature) ?? null); }),
      );

      if (insp.source_event_id) {
        promises.push(
          Promise.resolve(supabase.from('inspection_source_events').select('*').eq('id', insp.source_event_id).single())
            .then(r => { setSourceEvent(r.data as Record<string, unknown> | null); }),
        );
      }

      await Promise.all(promises);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  /* ─── Audit helper ─── */
  async function logAudit(action: string, prevStatus?: string | null, newStatus?: string | null, note?: string) {
    if (!inspection || !profile) return;
    await supabase.from('inspection_audit_log').insert({
      inspection_id: inspection.id,
      previous_status: prevStatus ?? null,
      new_status: newStatus ?? null,
      action,
      performed_by: profile.id,
      note: note ?? null,
    });
  }

  /* ─── Stage advancement ─── */
  const advanceStage = async (fromStage: WorkflowStage, toStage: WorkflowStage, extraUpdates: Record<string, unknown> = {}) => {
    if (!inspection) return;
    setSaving(true);
    const now = new Date().toISOString();
    const timestampField = `${fromStage}_completed_at`;
    const updates: Record<string, unknown> = {
      current_stage: toStage,
      [timestampField]: now,
      ...extraUpdates,
    };
    const { error } = await supabase.from('inspections').update(updates as any).eq('id', inspection.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      await logAudit('stage_advance', fromStage, toStage);
      // Defensive guard: if a stage advance also flips status into `submitted`,
      // route through the centralized checkout sync gate using the SAME timestamp.
      const nextStatus = typeof extraUpdates.status === 'string' ? extraUpdates.status : null;
      if (nextStatus) {
        const syncRes = await syncCheckoutIfApplicable({
          inspectionId: inspection.id,
          previousStatus: inspection.status,
          newStatus: nextStatus,
          eventTimeIso: now,
        });
        if (syncRes && !syncRes.ok) {
          toast({
            title: 'Sync HubSpot pendiente',
            description: 'El cambio se guardó pero el checkout no llegó a HubSpot. Revisa los logs salientes.',
            variant: 'destructive',
          });
        }
      }
      toast({ title: `Avanzado a: ${WORKFLOW_STAGES.find(s => s.key === toStage)?.label}` });
      await fetchAll();
    }
    setSaving(false);
  };

  /* ─── Save assignment/schedule ─── */
  const handleSave = async () => {
    if (!inspection) return;
    setSaving(true);
    const nextInspector = editInspector || null;
    const nextExecutive = editExecutive || null;
    const updates: Record<string, unknown> = {
      inspector_id: nextInspector,
      executive_id: nextExecutive,
    };
    // Auto-heal: si ambos IDs quedan asignados y el status sigue en
    // 'pending_assignment' (legacy), transicionar a 'assigned'.
    if (nextInspector && nextExecutive && inspection.status === 'pending_assignment') {
      updates.status = 'assigned';
    }
    const { error } = await supabase.from('inspections').update(updates as any).eq('id', inspection.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      if (inspection.inspector_id !== (editInspector || null) || inspection.executive_id !== (editExecutive || null)) {
        await logAudit('assignment_change', null, null, `Inspector: ${editInspector || 'none'}, Executive: ${editExecutive || 'none'}`);
      }
      toast({ title: 'Inspección actualizada' });
      await fetchAll();
    }
    setSaving(false);
  };

  /* ─── Force advance ─── */
  const handleForceAdvance = async () => {
    if (!inspection || !forceStatusValue) return;
    setSaving(true);
    const old = inspection.status;
    // One canonical timestamp for both DB stamp and HubSpot event_time.
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { status: forceStatusValue };
    // When forcing into `submitted`, also stamp inspection_completed_at + advance stage to review,
    // mirroring the inspector submit path. Only stamp completion if not already set so re-forces
    // don't overwrite the original business event time.
    if (forceStatusValue === 'submitted') {
      updates.current_stage = 'review';
      if (!inspection.inspection_completed_at) {
        updates.inspection_completed_at = now;
        updates.completed_at = now;
      }
    }
    const { error } = await supabase.from('inspections').update(updates as any).eq('id', inspection.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      await logAudit('force_advance', old, forceStatusValue, forceNote || undefined);
      // Centralized, transition-gated checkout sync (only fires on first-time → submitted).
      const syncRes = await syncCheckoutIfApplicable({
        inspectionId: inspection.id,
        previousStatus: old,
        newStatus: forceStatusValue,
        eventTimeIso: now,
      });
      if (syncRes && !syncRes.ok) {
        toast({
          title: 'Sync HubSpot pendiente',
          description: 'El estado cambió pero el checkout no llegó a HubSpot. Revisa los logs salientes.',
          variant: 'destructive',
        });
      } else {
        toast({ title: `Estado cambiado a ${forceStatusValue}` });
      }
      await fetchAll();
    }
    setForceStatusOpen(false);
    setForceNote('');
    setSaving(false);
  };

  /* ─── Delete inspection ─── */
  const handleDelete = async () => {
    if (!inspection) return;
    setDeleting(true);
    try {
      // Delete related records in order (no FK cascades)
      await supabase.from('inspection_field_values').delete().eq('inspection_id', inspection.id);

      // Delete photos from storage first to avoid orphaned files
      const { data: photoRows } = await supabase
        .from('inspection_photos')
        .select('storage_path')
        .eq('inspection_id', inspection.id);
      const storagePaths = (photoRows ?? [])
        .map((p: { storage_path: string }) => p.storage_path)
        .filter(Boolean);
      if (storagePaths.length > 0) {
        await supabase.storage.from('inspection-photos').remove(storagePaths);
      }
      await supabase.from('inspection_photos').delete().eq('inspection_id', inspection.id);
      await supabase.from('inspection_owner_feedback').delete().eq('inspection_id', inspection.id);
      await supabase.from('inspection_owner_feedback_submissions').delete().eq('inspection_id', inspection.id);
      await supabase.from('inspection_quotation_discounts').delete().eq('inspection_id', inspection.id);
      await supabase.from('inspection_signatures').delete().eq('inspection_id', inspection.id);
      await supabase.from('inspection_external_references').delete().eq('inspection_id', inspection.id);
      await supabase.from('communication_deliveries').delete().eq('inspection_id', inspection.id);
      await supabase.from('hubspot_sync_log').delete().eq('inspection_id', inspection.id);
      await supabase.from('slack_notifications_log').delete().eq('inspection_id', inspection.id);
      await supabase.from('inspection_reviews').delete().eq('inspection_id', inspection.id);
      await supabase.from('inspection_repair_items').delete().eq('inspection_id', inspection.id);
      await supabase.from('inspection_report_versions').delete().eq('inspection_id', inspection.id);
      await supabase.from('inspection_audit_log').delete().eq('inspection_id', inspection.id);
      await supabase.from('inspection_sections').delete().eq('inspection_id', inspection.id);

      // Capture source_event_id BEFORE deleting the inspection so we can clean
      // it up afterwards. Without this, the intake dedupes future HubSpot
      // webhooks against an orphan event and refuses to recreate the inspection.
      const sourceEventId = inspection.source_event_id ?? null;

      const { error } = await supabase.from('inspections').delete().eq('id', inspection.id);
      if (error) throw error;

      if (sourceEventId) {
        await supabase.from('inspection_source_events').delete().eq('id', sourceEventId);
      }

      toast({ title: 'Inspección eliminada' });
      navigate('/admin/inspections');
    } catch (err: any) {
      toast({ title: 'Error al eliminar', description: err.message, variant: 'destructive' });
    }
    setDeleting(false);
  };


  /* ─── Publish ─── */
  // Note: publishing does NOT trigger checkout_received. That outbound sync fires earlier,
  // exactly when an inspection first transitions into `submitted` (see syncCheckoutIfApplicable).
  const handlePublish = async () => {
    if (!inspection) return;
    setPublishing(true);

    const visibleRepairs = repairItems.filter(r => r.visible_to_owner);
    const visiblePhotos = photos.filter((p: any) => p.visible_to_owner !== false);

    const payload = {
      property: {
        property_id: inspection.property_id,
        property_name: inspection.property_name,
        address: inspection.address,
        market: inspection.market,
        property_type: inspection.property_type,
        inspection_type: inspection.inspection_type,
      },
      sections: sections.filter(s => s.is_visible).map(s => ({
        id: s.id,
        title: s.section_title,
        type: s.section_type,
        final_observation: finalObservations[s.id]?.trim() || s.final_observation || null,
        photos: visiblePhotos
          .filter(p => p.inspection_section_id === s.id)
          .map(p => ({ id: p.id, url: null, caption: p.caption })),
        repairs: visibleRepairs
          .filter(r => r.inspection_section_id === s.id)
          .map(r => ({
            name: r.owner_friendly_name_snapshot || r.title_snapshot,
            description: r.description_snapshot,
            category: r.category_snapshot,
            unit: r.unit,
            quantity: r.quantity,
            unit_price: r.unit_price,
            subtotal: r.subtotal,
            payer_role: r.payer_role,
            payment_nature: r.payment_nature,
          })),
      })),
      budget_total: visibleRepairs.reduce((sum, r) => sum + Number(r.subtotal ?? r.quantity * r.unit_price), 0),
      published_at: new Date().toISOString(),
    };

    const { data: existing } = await supabase
      .from('inspection_report_versions')
      .select('version_number')
      .eq('inspection_id', id!)
      .order('version_number', { ascending: false })
      .limit(1);
    const nextVersion = ((existing?.[0] as any)?.version_number ?? 0) + 1;

    // Atomic-in-practice publish: clear previous latest rows, then insert
    // owner + tenant rows in one batch so the RPC always finds exactly one
    // is_latest=true row per (inspection, audience).
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
      setPublishing(false);
      return;
    }

    await supabase.from('inspections').update({
      status: 'published',
      published_at: new Date().toISOString(),
      owner_url_generated_at: new Date().toISOString(),
      approved_at: new Date().toISOString(),
      approved_by: profile?.id,
    }).eq('id', inspection.id);

    await logAudit('publish', inspection.status, 'published', `v${nextVersion} (owner+tenant)`);
    toast({ title: `Reporte v${nextVersion} publicado (Propietario + Inquilino)` });
    await fetchAll();
    setPublishing(false);
  };

  /* ─── Review/Budget executive functions ─── */
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
    await fetchAll();
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
    toast({ title: 'Reparación agregada' });
    await refreshRepairs();
  };

  const updateRepairItem = async (repairId: string, field: string, value: any) => {
    await supabase.from('inspection_repair_items').update({ [field]: value, updated_by: profile?.id } as any).eq('id', repairId);
    await refreshRepairs();
  };

  const deleteRepairItem = async (repairId: string) => {
    await supabase.from('inspection_repair_items').delete().eq('id', repairId);
    toast({ title: 'Reparación eliminada' });
    await refreshRepairs();
  };

  const refreshRepairs = async () => {
    const { data } = await supabase.from('inspection_repair_items').select('*').eq('inspection_id', id!).order('sort_order');
    const rps = (data ?? []) as unknown as InspectionRepairItem[];
    setRepairItems(rps);
    setRepairsBySection(groupBy(rps));
  };

  /* ─── Copy public URLs (per audience) ─── */
  const getOwnerUrl = () => {
    const latest = reportVersions.find(v => v.is_latest && v.audience === 'owner' && v.public_token);
    if (!latest || !inspection) return null;
    return `${window.location.origin}/reportes/${inspection.property_id}/${latest.public_token}`;
  };

  const getTenantUrl = () => {
    const latest = reportVersions.find(v => v.is_latest && v.audience === 'tenant' && v.public_token);
    if (!latest || !inspection) return null;
    return `${window.location.origin}/reportes/${inspection.property_id}/${latest.public_token}`;
  };

  const copyOwnerUrl = () => {
    const url = getOwnerUrl();
    if (url) {
      navigator.clipboard.writeText(url);
      toast({ title: 'URL Propietario copiada' });
    }
  };

  /* ─── Status label helper ─── */
  const statusLabel = (value: string | null) => {
    if (!value) return null;
    const labels: Record<string, { text: string; className: string }> = {
      bueno: { text: 'Bueno', className: 'text-green-600' },
      regular: { text: 'Regular', className: 'text-yellow-600' },
      malo: { text: 'Malo', className: 'text-red-600 font-semibold' },
      no_aplica: { text: 'No Aplica', className: 'text-muted-foreground' },
    };
    return labels[value] ?? { text: value, className: '' };
  };

  /* ─── Derived data ─── */
  const inspectors = allProfiles.filter(p => p.role === 'inspector');
  const executives = allProfiles.filter(p => p.role === 'executive');
  const inspectorName = allProfiles.find(p => p.id === inspection?.inspector_id)?.full_name ?? null;
  const executiveName = allProfiles.find(p => p.id === inspection?.executive_id)?.full_name ?? null;
  const ownerUrl = getOwnerUrl();
  const operationalSections = useMemo(() => sections.filter(isRepairableSection), [sections]);
  const budgetTotal = repairItems.reduce((sum, r) => sum + (r.subtotal ?? r.quantity * r.unit_price), 0);
  const isPublished = inspection?.status === 'published';
  const currentStage = (inspection?.current_stage ?? 'inspection') as WorkflowStage;
  const progress = calculateProgress(sections);

  const filteredCatalog = catalogItems.filter((i) =>
    !catalogSearch || i.name.toLowerCase().includes(catalogSearch.toLowerCase()) || (i.owner_friendly_name ?? '').toLowerCase().includes(catalogSearch.toLowerCase())
  );

  /* ─── Executive-aligned derived data (budget breakdown, discount, owner feedback) ─── */
  const allRepairs = repairItems;
  const clientTotal = useMemo(
    () => allRepairs.filter(r => r.visible_to_owner).reduce((s, r) => s + (r.quantity * r.unit_price), 0),
    [allRepairs]
  );
  const contractorTotal = useMemo(
    () => allRepairs.reduce((s, r) => s + (r.quantity * Number((r as any).contractor_unit_price ?? 0)), 0),
    [allRepairs]
  );

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

  const utility = budgetBreakdown.grandTotal - contractorTotal;

  const missingSections = useMemo(
    () => operationalSections.filter(s => requiresFinalObservation(s.section_type) && !finalObservations[s.id]?.trim()),
    [operationalSections, finalObservations]
  );
  const showObservationWarnings = !['approved', 'published'].includes(inspection?.status ?? '');

  const effectiveSnapshot = inspection ? getEffectiveSnapshot(inspection) : {};
  const warrantyDeposit = typeof (effectiveSnapshot as any).warranty_deposit === 'number'
    ? (effectiveSnapshot as any).warranty_deposit as number
    : null;
  const depositDiff = warrantyDeposit !== null ? warrantyDeposit - budgetBreakdown.ownerRequired : null;

  // Tax config per market
  useEffect(() => {
    if (!inspection?.market) return;
    fetchTaxConfig(inspection.market).then(setTaxConfig).catch(() => setTaxConfig(null));
  }, [inspection?.market]);

  // Owner feedback (decisions by repair id)
  const ownerFeedback = useOwnerFeedbackByRepair(id);

  // Quotation discount
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

  const signatureRecord = signature
    ? { signature_status: signature.signature_status, signer_name: signature.signer_name, skip_reason: signature.skip_reason }
    : null;

  const selectedContractorName = useMemo(
    () => contractors.find(c => c.id === selectedContractorId)?.name ?? null,
    [contractors, selectedContractorId],
  );

  /* ─── Executive-aligned action handlers ─── */
  const handleContractorChange = useCallback(async (contractorId: string) => {
    if (!inspection) return;
    const newContractorId = contractorId === 'none' ? null : contractorId;
    setSelectedContractorId(newContractorId);
    await supabase.from('inspections').update({ contractor_id: newContractorId } as any).eq('id', inspection.id);
    // Rebind contractor prices for all repairs in this inspection
    if (newContractorId) {
      const { data: priceRows } = await supabase
        .from('repair_catalog_item_contractor_prices')
        .select('repair_catalog_item_id, contractor_unit_price')
        .eq('contractor_id', newContractorId);
      const priceMap = new Map<string, number>();
      for (const row of (priceRows ?? []) as any[]) {
        priceMap.set(row.repair_catalog_item_id, Number(row.contractor_unit_price));
      }
      let updated = 0;
      for (const r of allRepairs) {
        const cp = r.repair_catalog_item_id ? priceMap.get(r.repair_catalog_item_id) ?? 0 : 0;
        await supabase.from('inspection_repair_items').update({ contractor_unit_price: cp } as any).eq('id', r.id);
        updated += 1;
      }
      toast({ title: 'Contratista actualizado', description: `${updated} precios recargados` });
    } else {
      for (const r of allRepairs) {
        await supabase.from('inspection_repair_items').update({ contractor_unit_price: 0 } as any).eq('id', r.id);
      }
      toast({ title: 'Contratista actualizado', description: 'Precios de contratista puestos en 0' });
    }
    await fetchAll();
  }, [inspection, allRepairs, fetchAll, toast]);


  const handleAdminApprove = useCallback(async () => {
    if (!id) return;
    setSaving(true);
    try {
      await inspectionActionsService.approveInspection(id, profile?.id);
      toast({ title: 'Inspección aprobada' });
      await fetchAll();
    } catch (e: any) {
      toast({ title: 'No se pudo aprobar', description: e?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }, [id, profile?.id, fetchAll, toast]);

  /** Admin publish wrapper for PublishView (signature: `(force?: boolean) => Promise<void>`). */
  const handleAdminPublish = async (_force?: boolean) => { await handlePublish(); };

  const fetchPublishedUrls = useCallback(async () => {
    if (!inspection) return null;
    const { data } = await supabase
      .from('inspection_report_versions')
      .select('audience, public_token')
      .eq('inspection_id', inspection.id)
      .eq('is_latest', true);
    if (!data || data.length === 0) return null;
    const origin = window.location.origin;
    const ownerRow = (data as any[]).find(r => r.audience === 'owner');
    const tenantRow = (data as any[]).find(r => r.audience === 'tenant');
    return {
      owner: ownerRow ? `${origin}/reportes/${inspection.property_id}/${ownerRow.public_token}` : '',
      tenant: tenantRow ? `${origin}/reportes/${inspection.property_id}/${tenantRow.public_token}` : '',
    };
  }, [inspection]);

  const handleOpenOwner = useCallback(async () => {
    const u = await fetchPublishedUrls();
    if (u?.owner) window.open(u.owner, '_blank');
  }, [fetchPublishedUrls]);
  const handleOpenTenant = useCallback(async () => {
    const u = await fetchPublishedUrls();
    if (u?.tenant) window.open(u.tenant, '_blank');
  }, [fetchPublishedUrls]);
  const handleCopyOwner = useCallback(async () => {
    const u = await fetchPublishedUrls();
    if (u?.owner) { navigator.clipboard.writeText(u.owner); toast({ title: 'Link propietario copiado' }); }
  }, [fetchPublishedUrls, toast]);
  const handleCopyTenant = useCallback(async () => {
    const u = await fetchPublishedUrls();
    if (u?.tenant) { navigator.clipboard.writeText(u.tenant); toast({ title: 'Link inquilino copiado' }); }
  }, [fetchPublishedUrls, toast]);

  const handleOpenDiscount = useCallback(() => setDiscountSheetOpen(true), []);
  const handleRemoveDiscount = useCallback(async () => {
    try { await discountState.remove(); toast({ title: 'Descuento eliminado' }); }
    catch (e: any) { toast({ title: 'No se pudo eliminar', description: e?.message, variant: 'destructive' }); }
  }, [discountState, toast]);
  const handleDiscountSubmit = useCallback(async (input: QuotationDiscountInput) => {
    try { await discountState.apply(input); toast({ title: 'Descuento aplicado' }); }
    catch (e: any) { toast({ title: 'No se pudo aplicar', description: e?.message, variant: 'destructive' }); }
  }, [discountState, toast]);

  const handleJumpToInspectionSection = useCallback((sectionId?: string) => {
    setActiveTab('inspection');
    if (sectionId) {
      // Try to scroll the collapsed section into view
      setTimeout(() => {
        const el = document.getElementById(`admin-section-${sectionId}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, []);



  if (loading) {
    return (
      <AdminLayout>
        <div className="p-6 max-w-6xl space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </AdminLayout>
    );
  }

  if (!inspection) {
    return (
      <AdminLayout>
        <div className="p-6 text-center text-muted-foreground">Inspección no encontrada</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 max-w-6xl space-y-6">
        {/* ─── Header ─── */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin/inspections')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-semibold truncate">{inspection.property_name ?? inspection.property_id}</h1>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" /> {inspection.address ?? 'Sin dirección'}
            </p>
          </div>
          <InspectionStatusBadge status={inspection.status} />
        </div>

        {/* ─── Top Summary Bar ─── */}
        <Card className="border-0 ring-1 ring-border shadow-sm">
          <CardContent className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <SummaryItem label="Property ID" value={inspection.property_id} />
              <SummaryItem label="Mercado" value={inspection.market} />
              <SummaryItem label="Inspector" value={inspectorName ?? 'Sin asignar'} muted={!inspectorName} />
              <SummaryItem label="Ejecutivo" value={executiveName ?? 'Sin asignar'} muted={!executiveName} />
              <SummaryItem label="Tipo" value={inspection.inspection_type} />
              {(() => {
                const snap = getEffectiveSnapshot(inspection);
                const fechaLlaves = (snap?.fecha_recoleccion_llaves as string) ?? null;
                const horaLlaves = (snap?.hora_recoleccion_llaves as string) ?? null;
                const val = fechaLlaves ? `${fechaLlaves}${horaLlaves ? ` · ${horaLlaves}` : ''}` : 'Sin coordinar';

                const openEditor = () => {
                  setKeyDateInput(fechaLlaves ? new Date(`${fechaLlaves}T00:00:00`) : undefined);
                  setKeyTimeInput(horaLlaves ?? '');
                  setKeyEditorOpen(true);
                };

                const handleSave = async () => {
                  if (!keyDateInput) {
                    toast({ title: 'Falta la fecha', variant: 'destructive' });
                    return;
                  }
                  setSavingKeyDate(true);
                  try {
                    const dateValue = format(keyDateInput, 'yyyy-MM-dd');
                    const timeValue = keyTimeInput || null;
                    const mergedOverrides = {
                      ...((inspection.property_overrides_json as Record<string, unknown>) ?? {}),
                      fecha_recoleccion_llaves: dateValue,
                      hora_recoleccion_llaves: timeValue,
                    };
                    const { error } = await supabase
                      .from('inspections')
                      .update({ property_overrides_json: mergedOverrides })
                      .eq('id', inspection.id);
                    if (error) {
                      toast({ title: 'Error al guardar', description: error.message, variant: 'destructive' });
                      return;
                    }
                    setInspection({ ...inspection, property_overrides_json: mergedOverrides });
                    setKeyEditorOpen(false);
                    // Honest local-save toast — does NOT claim HubSpot success.
                    toast({ title: 'Recolección guardada', description: 'Fecha/hora actualizada.' });
                    // Await sync; surface HubSpot outcome only on failure.
                    const syncRes = await triggerKeyCollectionSync(inspection.id);
                    if (!syncRes.ok) {
                      toast({
                        variant: 'destructive',
                        title: 'Sync HubSpot pendiente',
                        description: 'La fecha se guardó pero no se pudo enviar a HubSpot. Revisa los logs salientes.',
                      });
                    }
                  } finally {
                    setSavingKeyDate(false);
                  }
                };

                const handleResend = async () => {
                  setResendingKeyDate(true);
                  const res = await triggerKeyCollectionSync(inspection.id);
                  setResendingKeyDate(false);
                  toast({
                    title: res.ok ? 'Reenviado a HubSpot' : 'Error al reenviar',
                    description: res.ok
                      ? 'Revisa los logs salientes para confirmar el resultado.'
                      : 'Revisa los logs salientes para más detalles.',
                    variant: res.ok ? 'default' : 'destructive',
                  });
                };

                return (
                  <div className="flex flex-col gap-1 min-w-0">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Recolección de llaves
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Popover open={keyEditorOpen} onOpenChange={setKeyEditorOpen}>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            onClick={openEditor}
                            className={cn(
                              'text-sm font-medium truncate text-left hover:underline',
                              !fechaLlaves && 'text-muted-foreground italic'
                            )}
                          >
                            {val}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-3 space-y-3" align="start">
                          <div>
                            <Label className="text-xs">Fecha</Label>
                            <Calendar
                              mode="single"
                              selected={keyDateInput}
                              onSelect={setKeyDateInput}
                              initialFocus
                              className={cn('p-3 pointer-events-auto')}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Hora (opcional)</Label>
                            <Input
                              type="time"
                              value={keyTimeInput}
                              onChange={(e) => setKeyTimeInput(e.target.value)}
                            />
                          </div>
                          <Button size="sm" onClick={handleSave} disabled={savingKeyDate} className="w-full">
                            {savingKeyDate ? 'Guardando…' : 'Guardar y enviar a HubSpot'}
                          </Button>
                        </PopoverContent>
                      </Popover>
                      {fechaLlaves && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          title="Reenviar a HubSpot"
                          onClick={handleResend}
                          disabled={resendingKeyDate}
                        >
                          <Send className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {/* Secondary CTA per retry plan §5.B — primary surface remains the logs page. */}
                      <a
                        href={`/admin/integrations/hubspot/outbound-logs?inspection=${inspection.id}`}
                        className="text-[11px] text-muted-foreground hover:text-primary hover:underline whitespace-nowrap"
                        title="Ver logs HubSpot de esta inspección"
                      >
                        Ver logs →
                      </a>
                    </div>
                  </div>
                );
              })()}
              {(() => {
                const snap = getEffectiveSnapshot(inspection);
                const terminoContrato = (snap?.fecha_de_termino_real_de_contrato as string) ?? null;
                return <SummaryItem label={`${getContractDateShortLabel(inspection.inspection_type)} (ref.)`} value={terminoContrato ?? 'No disponible'} muted={!terminoContrato} />;
              })()}
            </div>
          </CardContent>
        </Card>

        {/* ─── 4-Stage Workflow Stepper ─── */}
        <Card className="border-0 ring-1 ring-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Flujo de Trabajo
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="flex items-center gap-0">
              {WORKFLOW_STAGES.map((stage, i) => {
                const currentIdx = stageIndex(currentStage);
                const thisIdx = stageIndex(stage.key);
                const isCompleted = thisIdx < currentIdx || (stage.key === 'share' && isPublished);
                const isCurrent = stage.key === currentStage && !isPublished;
                const Icon = stage.icon;

                let timestamp: string | null = null;
                if (stage.key === 'inspection') timestamp = inspection.inspection_completed_at;
                else if (stage.key === 'review') timestamp = inspection.review_completed_at;
                else if (stage.key === 'budget') timestamp = inspection.budget_completed_at;
                else if (stage.key === 'share') timestamp = inspection.published_at;

                return (
                  <div key={stage.key} className="flex items-center flex-1 last:flex-initial">
                    <div className="flex flex-col items-center gap-1.5 min-w-0">
                      <div className={cn(
                        'flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all',
                        isCompleted
                          ? 'bg-primary border-primary text-primary-foreground'
                          : isCurrent
                            ? 'bg-background border-primary text-primary ring-4 ring-primary/20'
                            : 'bg-muted border-border text-muted-foreground'
                      )}>
                        {isCompleted ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                      </div>
                      <span className={cn(
                        'text-xs font-medium text-center',
                        isCompleted ? 'text-foreground' : isCurrent ? 'text-primary' : 'text-muted-foreground'
                      )}>
                        {stage.label}
                      </span>
                      {timestamp && (
                        <span className="text-[10px] text-muted-foreground">
                          {format(new Date(timestamp), 'dd MMM HH:mm', { locale: es })}
                        </span>
                      )}
                      {isCurrent && (
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-primary bg-primary/10 rounded-full px-2 py-0.5">
                          Actual
                        </span>
                      )}
                      {isPublished && stage.key === 'share' && (
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-green-700 bg-green-100 rounded-full px-2 py-0.5">
                          Publicado
                        </span>
                      )}
                    </div>
                    {i < WORKFLOW_STAGES.length - 1 && (
                      <div className={cn(
                        'flex-1 h-0.5 mx-2 mt-[-2rem]',
                        thisIdx < currentIdx ? 'bg-primary' : 'bg-border'
                      )} />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Stage action buttons */}
            <div className="mt-6 flex flex-wrap gap-2">
              {currentStage === 'inspection' && !isPublished && (
                <Button onClick={() => advanceStage('inspection', 'review', { status: 'in_review' })} disabled={saving} className="gap-2">
                  <CheckCircle2 className="h-4 w-4" /> Completar Inspección
                </Button>
              )}
              {currentStage === 'review' && !isPublished && (
                <Button onClick={() => advanceStage('review', 'budget')} disabled={saving} className="gap-2">
                  <CheckCircle2 className="h-4 w-4" /> Completar Revisión
                </Button>
              )}
              {currentStage === 'budget' && !isPublished && (
                <Button onClick={() => advanceStage('budget', 'share')} disabled={saving} className="gap-2">
                  <CheckCircle2 className="h-4 w-4" /> Completar Presupuesto
                </Button>
              )}
              {currentStage === 'share' && !isPublished && !isAcceptedByOwner(inspection) && (
                <Button onClick={handlePublish} disabled={publishing} className="gap-2">
                  <ExternalLink className="h-4 w-4" /> {publishing ? 'Publicando...' : 'Publicar y Generar URL'}
                </Button>
              )}
              {currentStage === 'share' && !isPublished && isAcceptedByOwner(inspection) && (
                <div className="inline-flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-status-good" />
                  Ciclo cerrado por el propietario
                </div>
              )}
              {isPublished && ownerUrl && (
                <div className="flex items-center gap-2 flex-wrap">
                  <Button onClick={copyOwnerUrl} variant="outline" className="gap-2">
                    <Copy className="h-4 w-4" /> Copiar URL Propietario
                  </Button>
                  <Button variant="outline" className="gap-2" asChild>
                    <a href={ownerUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4" /> Abrir Reporte
                    </a>
                  </Button>
                  <Button onClick={handlePublish} variant="ghost" disabled={publishing} className="gap-2 text-muted-foreground">
                    <ExternalLink className="h-4 w-4" /> {publishing ? 'Republicando...' : 'Republicar'}
                  </Button>
                </div>
              )}
            </div>

            {/* Post-publish info */}
            {isPublished && ownerUrl && (
              <div className="mt-4 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <span className="font-medium text-green-800 dark:text-green-300">Reporte publicado</span>
                </div>
                <div className="flex items-center gap-2 bg-background rounded-md border px-3 py-2">
                  <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm truncate flex-1 font-mono">{ownerUrl}</span>
                  <Button variant="ghost" size="sm" onClick={copyOwnerUrl} className="shrink-0 h-7">
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {reportVersions.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Versión actual: v{reportVersions[0].version_number} · {format(new Date(reportVersions[0].created_at), 'dd MMM yyyy HH:mm', { locale: es })}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ─── Admin Actions Bar ─── */}
        <Card className="border-0 ring-1 ring-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Acciones Administrativas</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Inspector</Label>
                <Select value={editInspector} onValueChange={setEditInspector}>
                  <SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                  <SelectContent>
                    {inspectors.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Ejecutivo</Label>
                <Select value={editExecutive} onValueChange={setEditExecutive}>
                  <SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                  <SelectContent>
                    {executives.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleSave} disabled={saving} className="gap-2">
                <Save className="h-4 w-4" />
                {saving ? 'Guardando...' : 'Guardar Cambios'}
              </Button>

              {/* Force advance */}
              <Dialog open={forceStatusOpen} onOpenChange={setForceStatusOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <AlertTriangle className="h-4 w-4" /> Forzar Avance
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Forzar cambio de estado</DialogTitle>
                    <DialogDescription>Esta acción se registrará en el log de auditoría.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    <div className="space-y-2">
                      <Label>Nuevo estado</Label>
                      <Select value={forceStatusValue} onValueChange={setForceStatusValue}>
                        <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                        <SelectContent>
                          {ALL_STATUSES.map(s => (
                            <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Nota (opcional)</Label>
                      <Textarea value={forceNote} onChange={(e) => setForceNote(e.target.value)} placeholder="Razón del cambio..." />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setForceStatusOpen(false)}>Cancelar</Button>
                    <Button onClick={handleForceAdvance} disabled={!forceStatusValue || saving}>Confirmar</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Delete inspection */}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="gap-2 ml-auto">
                    <Trash2 className="h-4 w-4" /> Eliminar Inspección
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Eliminar esta inspección?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta acción es irreversible. Se eliminarán permanentemente todas las secciones,
                      campos, fotos, reparaciones, revisiones, versiones de reporte y registros de auditoría
                      asociados a esta inspección.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDelete}
                      disabled={deleting}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {deleting ? 'Eliminando...' : 'Sí, eliminar'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>

        {/* ─── Property Briefing Card (REM source of truth) ─── */}
        <Card className="border-0 ring-1 ring-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" /> Datos del inmueble
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Sincronizados desde REM. Fuente de verdad del inmueble. No editable desde Homie.
            </p>
          </CardHeader>
          <CardContent className="pt-0">
            <PropertyBriefingCard inspection={inspection} />
          </CardContent>
        </Card>

        {/* ─── Signature Status ─── */}
        {signature && (
          <Card className="border-0 ring-1 ring-border shadow-sm">
            <CardContent className="p-4">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Firma del Inquilino</p>
              {signature.signature_status === 'signed' ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-tiny font-medium bg-status-good-bg text-status-good">Firmado</span>
                    {signature.signer_name && <span className="text-caption">{signature.signer_name}</span>}
                  </div>
                  {signature.signature_data && (
                    <img src={signature.signature_data} alt="Firma" className="h-20 rounded-lg border bg-white" />
                  )}
                </div>
              ) : (
                <div className="space-y-1">
                  <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-tiny font-medium',
                    signature.signature_status === 'refused' ? 'bg-status-bad-bg text-status-bad' : 'bg-status-regular-bg text-status-regular'
                  )}>
                    {signature.signature_status === 'refused' ? 'Se negó a firmar' : 'No disponible'}
                  </span>
                  {signature.skip_reason && <p className="text-caption text-muted-foreground">{signature.skip_reason}</p>}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ─── Detail Tabs ─── */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="payload" className="gap-1.5"><Package className="h-3.5 w-3.5" /> Payload</TabsTrigger>
            <TabsTrigger value="inspection" className="gap-1.5"><FileText className="h-3.5 w-3.5" /> Inspección</TabsTrigger>
            <TabsTrigger value="review" className="gap-1.5"><Shield className="h-3.5 w-3.5" /> Revisión</TabsTrigger>
            <TabsTrigger value="budget" className="gap-1.5"><DollarSign className="h-3.5 w-3.5" /> Presupuesto</TabsTrigger>
            <TabsTrigger value="quotation" className="gap-1.5"><Receipt className="h-3.5 w-3.5" /> Cotización</TabsTrigger>
            <TabsTrigger value="publish" className="gap-1.5"><Share2 className="h-3.5 w-3.5" /> Publicación</TabsTrigger>
          </TabsList>

          {/* ── Payload tab ── */}
          <TabsContent value="payload">
            <Card className="border-0 ring-1 ring-border shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Property Snapshot</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto max-h-96">
                  {JSON.stringify(inspection.property_snapshot_json, null, 2)}
                </pre>
              </CardContent>
            </Card>
            {sourceEvent && (
              <Card className="border-0 ring-1 ring-border shadow-sm mt-4">
                <CardHeader>
                  <CardTitle className="text-base">Source Event Payload</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto max-h-96">
                    {JSON.stringify(sourceEvent, null, 2)}
                  </pre>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── Inspection tab — full inline editing ── */}
          <TabsContent value="inspection">
            <Card className="border-0 ring-1 ring-border shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Secciones ({operationalSections.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {operationalSections.length === 0 && <p className="text-sm text-muted-foreground">No hay secciones generadas.</p>}
                {operationalSections.map((sec, idx) => {
                  const secFields = fieldsBySection[sec.id] ?? [];
                  const secPhotos = (photosBySection[sec.id] ?? []);
                  const completed = isSectionCompleted(sec.status);
                  const statusFields = secFields.filter(f => f.group_key === 'status');
                  const obsField = secFields.find(f => f.group_key === 'observation');
                  const otherFields = secFields.filter(f => f.group_key !== 'status' && f.group_key !== 'observation' && f.group_key !== 'photo');

                  return (
                    <div key={sec.id} id={`admin-section-${sec.id}`}><Collapsible>
                      <CollapsibleTrigger className="flex items-center gap-3 w-full py-2.5 px-3 rounded-lg hover:bg-muted/50 transition-colors text-left">
                        <span className="text-xs text-muted-foreground w-5 text-right shrink-0">{idx + 1}</span>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium">{sec.section_title}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={cn('text-[10px] font-medium', completed ? 'text-status-good' : 'text-muted-foreground')}>
                            {completed ? '100%' : '0%'}
                          </span>
                          <SectionStatusBadge status={sec.status} />
                          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pl-11 pr-3 pb-4 space-y-4">
                        {/* Section status toggle */}
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant={completed ? 'outline' : 'default'}
                            onClick={async () => {
                              const newStatus = completed ? 'not_started' : 'completed';
                              await supabase.from('inspection_sections').update({ status: newStatus }).eq('id', sec.id);
                              toast({ title: completed ? 'Sección reabierta' : 'Sección completada' });
                              await fetchAll();
                            }}>
                            {completed ? 'Reabrir' : 'Marcar completada'}
                          </Button>
                        </div>

                        {/* Status fields — clickable chips */}
                        {statusFields.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Estado</p>
                            {statusFields.map(f => (
                              <div key={f.id} className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs text-muted-foreground w-32 shrink-0">{f.field_label}</span>
                                {['bueno', 'regular', 'malo', 'no_aplica'].map(val => (
                                  <button key={val}
                                    onClick={async () => {
                                      await supabase.from('inspection_field_values').update({ value_text: val, updated_by: profile?.id }).eq('id', f.id);
                                      await fetchAll();
                                    }}
                                    className={cn(
                                      'px-2.5 py-1 rounded-full text-tiny font-medium border transition-colors',
                                      f.value_text === val
                                        ? val === 'bueno' ? 'bg-status-good-bg text-status-good border-status-good/30'
                                          : val === 'regular' ? 'bg-status-regular-bg text-status-regular border-status-regular/30'
                                          : val === 'malo' ? 'bg-status-bad-bg text-status-bad border-status-bad/30'
                                          : 'bg-status-na-bg text-status-na border-status-na/30'
                                        : 'bg-muted/50 text-muted-foreground border-transparent hover:bg-muted'
                                    )}>
                                    {val === 'no_aplica' ? 'N/A' : val.charAt(0).toUpperCase() + val.slice(1)}
                                  </button>
                                ))}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Text fields — editable */}
                        {otherFields.map(f => (
                          <div key={f.id} className="space-y-1">
                            <Label className="text-[10px] text-muted-foreground">{f.field_label}</Label>
                            <Input
                              value={f.value_text ?? ''}
                              className="h-8 text-xs"
                              onBlur={async (e) => {
                                if (e.target.value !== (f.value_text ?? '')) {
                                  await supabase.from('inspection_field_values').update({ value_text: e.target.value || null, updated_by: profile?.id }).eq('id', f.id);
                                  await fetchAll();
                                }
                              }}
                              onChange={(e) => {
                                setFieldValues(prev => prev.map(fv => fv.id === f.id ? { ...fv, value_text: e.target.value } : fv));
                                setFieldsBySection(prev => ({
                                  ...prev,
                                  [sec.id]: (prev[sec.id] ?? []).map(fv => fv.id === f.id ? { ...fv, value_text: e.target.value } : fv),
                                }));
                              }}
                            />
                          </div>
                        ))}

                        {/* Observation — editable textarea */}
                        {obsField && (
                          <div className="space-y-1">
                            <Label className="text-[10px] text-muted-foreground">Observación del inspector</Label>
                            <Textarea
                              value={obsField.value_text ?? ''}
                              rows={2}
                              className="text-xs"
                              onBlur={async (e) => {
                                if (e.target.value !== (obsField.value_text ?? '')) {
                                  await supabase.from('inspection_field_values').update({ value_text: e.target.value || null, updated_by: profile?.id }).eq('id', obsField.id);
                                  await fetchAll();
                                }
                              }}
                              onChange={(e) => {
                                setFieldValues(prev => prev.map(fv => fv.id === obsField.id ? { ...fv, value_text: e.target.value } : fv));
                                setFieldsBySection(prev => ({
                                  ...prev,
                                  [sec.id]: (prev[sec.id] ?? []).map(fv => fv.id === obsField.id ? { ...fv, value_text: e.target.value } : fv),
                                }));
                              }}
                            />
                          </div>
                        )}

                        {/* Photos — grid with view, visibility toggle, delete */}
                        {secPhotos.length > 0 && (
                          <div>
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Fotos ({secPhotos.length})</p>
                            <div className="grid grid-cols-4 gap-2">
                              {secPhotos.map(p => {
                                const visible = (p as any).visible_to_owner !== false;
                                return (
                                  <div key={p.id} className="relative group">
                                    <img
                                      src={urlOf(p.id, 'thumb')} loading="lazy" decoding="async" alt={p.caption ?? ''}
                                      className={cn('aspect-square rounded-xl object-cover cursor-pointer', !visible && 'opacity-40')}
                                      onClick={() => setPhotoLightbox(p)}
                                    />
                                    <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <button onClick={() => togglePhotoVisibility(p)}
                                        className="p-1 rounded-md bg-background/80">
                                        {visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3 text-muted-foreground" />}
                                      </button>
                                      <button onClick={async () => {
                                        await supabase.from('inspection_photos').delete().eq('id', p.id);
                                        toast({ title: 'Foto eliminada' });
                                        await fetchAll();
                                      }} className="p-1 rounded-md bg-background/80 text-destructive">
                                        <Trash2 className="h-3 w-3" />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </CollapsibleContent>
                    </Collapsible></div>
                  );
                })}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Review tab — full executive capabilities ── */}
          <TabsContent value="review">
            <div className="space-y-4">
              {showObservationWarnings && missingSections.length > 0 && (
                <PendingDecisionsBanner
                  missingSections={missingSections}
                  onJumpToSection={handleJumpToInspectionSection}
                />
              )}
              {operationalSections.length === 0 && (
                <Card className="border-0 ring-1 ring-border shadow-sm">
                  <CardContent className="p-4"><p className="text-sm text-muted-foreground">No hay secciones.</p></CardContent>
                </Card>
              )}
              {operationalSections.map(section => {
                const sFields = fieldsBySection[section.id] ?? [];
                const sPhotos = photosBySection[section.id] ?? [];
                const sReviews = reviewsBySection[section.id] ?? [];
                const sStatusFields = sFields.filter((f) => f.group_key === 'status');
                const hasMalo = sStatusFields.some((f) => f.value_text === 'malo');
                const inspectorObs = sFields.find((f) => f.group_key === 'observation')?.value_text;

                return (
                  <Card key={section.id}
                    className={cn('border-0 ring-1 shadow-sm', hasMalo ? 'ring-red-300 border-l-4 border-l-red-500' : 'ring-border')}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm">{section.section_title}</CardTitle>
                        <SectionStatusBadge status={section.status} />
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Status fields */}
                      {sStatusFields.map((f) => {
                        const label = statusLabel(f.value_text);
                        return (
                          <div key={f.id} className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">{f.field_label}</span>
                            {label && <span className={label.className}>{label.text}</span>}
                          </div>
                        );
                      })}

                      {/* Other fields */}
                      {sFields.filter((f) => f.group_key !== 'status' && f.group_key !== 'photo' && f.group_key !== 'observation' && f.value_text).map((f) => (
                        <div key={f.id} className="text-xs">
                          <span className="text-muted-foreground">{f.field_label}: </span>
                          <span>{f.value_text}</span>
                        </div>
                      ))}

                      {/* Inspector observation */}
                      {inspectorObs && (
                        <div className="bg-muted/30 rounded-lg p-3 space-y-1">
                          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Observación del Inspector</p>
                          <p className="text-xs">{inspectorObs}</p>
                        </div>
                      )}

                      {/* Photos with visibility toggles */}
                      {sPhotos.length > 0 && (
                        <div>
                          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Fotos ({sPhotos.length})</p>
                          <div className="grid grid-cols-4 gap-2">
                            {sPhotos.map((p) => {
                              const visible = (p as any).visible_to_owner !== false;
                              return (
                                <div key={p.id} className="relative group">
                                  <img src={urlOf(p.id, 'thumb')} loading="lazy" decoding="async" alt={p.caption ?? ''}
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
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Comentario Interno</p>
                        <Textarea
                          value={internalNotes[section.id] ?? ''}
                          onChange={(e) => setInternalNotes((p) => ({ ...p, [section.id]: e.target.value }))}
                          placeholder="Nota interna (no visible al propietario)..."
                          rows={2} className="text-xs"
                        />
                        <Button size="sm" variant="outline" onClick={() => saveInternalNote(section.id)}
                          disabled={savingField === section.id + '-note'}>
                          Guardar nota
                        </Button>
                      </div>

                      {/* Final observation (public) */}
                      <div className="border-t pt-3 space-y-2">
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                          Observación Final <Badge variant="secondary" className="text-[10px] ml-1">Pública</Badge>
                        </p>
                        <Textarea
                          value={finalObservations[section.id] ?? ''}
                          onChange={(e) => setFinalObservations((p) => ({ ...p, [section.id]: e.target.value }))}
                          placeholder="Observación visible para el propietario..."
                          rows={3} className="text-xs"
                        />
                        <Button size="sm" variant="outline" onClick={() => saveFinalObservation(section.id)}
                          disabled={savingField === section.id + '-obs'}>
                          Guardar observación
                        </Button>
                      </div>

                      {/* Existing reviews */}
                      {sReviews.length > 0 && (
                        <div className="border-t pt-3 space-y-1">
                          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Historial de notas</p>
                          {sReviews.map(r => (
                            <div key={r.id} className="text-xs border-l-2 border-primary/30 pl-2">
                              <span className="text-muted-foreground">[{r.comment_type}]</span> {r.comment}
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          {/* ── Budget tab — full executive capabilities ── */}
          <TabsContent value="budget">
            <div className="space-y-4">
              {/* Grand total card */}
              <Card className="border-0 ring-1 ring-border shadow-sm">
                <CardContent className="p-4 flex items-center justify-between">
                  <span className="text-sm font-medium">Total Presupuesto (visible al propietario)</span>
                  <span className="text-lg font-semibold text-primary font-mono">${clientTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                </CardContent>
              </Card>

              {/* Consolidated repairs table — same component used by the executive */}
              <Card className="border-0 ring-1 ring-border shadow-sm overflow-hidden">
                <div className="min-h-[60vh]">
                  <RepairsTableView
                    sections={operationalSections}
                    allRepairs={allRepairs}
                    contractors={contractors}
                    selectedContractorId={selectedContractorId}
                    onContractorChange={handleContractorChange}
                    contractorTotal={contractorTotal}
                    clientTotal={clientTotal}
                    utility={utility}
                    budgetBreakdown={budgetBreakdown}
                    warrantyDeposit={warrantyDeposit}
                    depositDiff={depositDiff}
                    onOpenCatalog={openCatalog}
                    onUpdateRepair={updateRepairItem}
                    onDeleteRepair={deleteRepairItem}
                    feedbackByRepairId={ownerFeedback.feedbackByRepairId}
                  />
                </div>
              </Card>

              {/* Published versions — grouped by version_number (one row per version, two audience links) */}
              <Card className="border-0 ring-1 ring-border shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Versiones Publicadas</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {reportVersions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No hay versiones publicadas.</p>
                  ) : (
                    Array.from(
                      reportVersions.reduce((map, v) => {
                        const arr = map.get(v.version_number) ?? [];
                        arr.push(v);
                        map.set(v.version_number, arr);
                        return map;
                      }, new Map<number, InspectionReportVersion[]>()).entries()
                    )
                      .sort(([a], [b]) => b - a)
                      .map(([version, rows]) => {
                        const owner = rows.find(r => r.audience === 'owner');
                        const tenant = rows.find(r => r.audience === 'tenant');
                        const isLatest = rows.some(r => r.is_latest);
                        const createdAt = rows[0].created_at;
                        const copyUrl = (token: string | null, label: string) => {
                          if (!token || !inspection) return;
                          const url = `${window.location.origin}/reportes/${inspection.property_id}/${token}`;
                          navigator.clipboard.writeText(url);
                          toast({ title: `URL ${label} copiada` });
                        };
                        return (
                          <div key={version} className="flex flex-wrap items-center gap-3 py-2 border-b last:border-0">
                            <span className={cn('text-sm font-medium', isLatest && 'text-primary')}>
                              v{version}
                            </span>
                            {isLatest && <span className="text-[10px] uppercase bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-semibold">Última</span>}
                            <span className="text-xs text-muted-foreground flex-1 min-w-[120px]">
                              {format(new Date(createdAt), 'dd MMM yyyy HH:mm', { locale: es })}
                            </span>
                            <Button
                              variant="ghost" size="sm" disabled={!owner?.public_token}
                              className="h-7 gap-1 text-xs"
                              onClick={() => copyUrl(owner?.public_token ?? null, 'Propietario')}
                            >
                              <Copy className="h-3 w-3" /> Propietario
                            </Button>
                            <Button
                              variant="ghost" size="sm" disabled={!tenant?.public_token}
                              className="h-7 gap-1 text-xs"
                              onClick={() => copyUrl(tenant?.public_token ?? null, 'Inquilino')}
                            >
                              <Copy className="h-3 w-3" /> Inquilino
                            </Button>
                          </div>
                        );
                      })
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Cotización tab ── */}
          <TabsContent value="quotation">
            <Card className="border-0 ring-1 ring-border shadow-sm overflow-hidden">
              <div className="min-h-[60vh]">
                <QuotationView
                  budgetBreakdown={budgetBreakdown}
                  discountBreakdown={discountBreakdown}
                  activeDiscount={activeDiscountInput}
                  discountReason={discountState.discount?.discount_reason ?? null}
                  onOpenDiscount={handleOpenDiscount}
                  onRemoveDiscount={handleRemoveDiscount}
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
                  onGoToRepairs={() => setActiveTab('budget')}
                  onGoToPublish={() => setActiveTab('publish')}
                  ownerPendingFeedbackCount={ownerFeedback.pendingCount}
                  ownerFeedbackVersionNumber={ownerFeedback.versionNumber}
                />
              </div>
            </Card>
          </TabsContent>

          {/* ── Publicación tab ── */}
          <TabsContent value="publish">
            <Card className="border-0 ring-1 ring-border shadow-sm overflow-hidden">
              <div className="min-h-[60vh]">
                {inspection && (
                  <PublishView
                    inspection={inspection}
                    operationalSections={operationalSections}
                    missingSections={showObservationWarnings ? missingSections : []}
                    hasRepairs={allRepairs.length > 0}
                    hasContractor={!!selectedContractorId}
                    signatureRecord={signatureRecord}
                    isPublished={isPublished}
                    submitting={saving || publishing}
                    onApprove={handleAdminApprove}
                    onPublish={handleAdminPublish}
                    onOpenOwner={handleOpenOwner}
                    onOpenTenant={handleOpenTenant}
                    onCopyOwner={handleCopyOwner}
                    onCopyTenant={handleCopyTenant}
                    onGoToInspection={handleJumpToInspectionSection}
                    onGoToRepairs={() => setActiveTab('budget')}
                    onRefresh={fetchAll}
                  />
                )}
              </div>
            </Card>
          </TabsContent>
        </Tabs>


        {/* ─── Audit Log ─── */}
        <Collapsible>
          <Card className="border-0 ring-1 ring-border shadow-sm">
            <CollapsibleTrigger className="w-full">
              <CardHeader className="flex flex-row items-center justify-between cursor-pointer">
                <CardTitle className="text-base flex items-center gap-2">
                  <History className="h-4 w-4 text-muted-foreground" />
                  Log de Auditoría ({auditLog.length})
                </CardTitle>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0 space-y-2">
                {auditLog.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin registros.</p>
                ) : (
                  auditLog.map(entry => {
                    const performer = allProfiles.find(p => p.id === entry.performed_by);
                    return (
                      <div key={entry.id} className="flex items-start gap-3 py-2 border-b last:border-0 text-sm">
                        <div className="flex-1 min-w-0">
                          <span className="font-medium">{entry.action.replace(/_/g, ' ')}</span>
                          {entry.previous_status && entry.new_status && (
                            <span className="text-muted-foreground"> · {entry.previous_status} → {entry.new_status}</span>
                          )}
                          {entry.note && <p className="text-xs text-muted-foreground mt-0.5">{entry.note}</p>}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs text-muted-foreground">{performer?.full_name ?? 'Sistema'}</p>
                          <p className="text-[10px] text-muted-foreground">{format(new Date(entry.created_at), 'dd/MM HH:mm')}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* ─── Photo Lightbox ─── */}
        {photoLightbox && (
          <Dialog open={!!photoLightbox} onOpenChange={(o) => !o && setPhotoLightbox(null)}>
            <DialogContent className="max-w-2xl">
              <img src={urlOf(photoLightbox.id)} alt={photoLightbox.caption ?? ''} className="w-full rounded-lg" />
              {photoLightbox.caption && <p className="text-caption text-muted-foreground text-center">{photoLightbox.caption}</p>}
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* ─── Catalog Sheet ─── */}
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
                  <p className="text-xs font-medium">{item.name}</p>
                  {item.owner_friendly_name && <p className="text-[10px] text-muted-foreground">{item.owner_friendly_name}</p>}
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <Badge variant="secondary" className="text-[10px]">{item.category?.name}</Badge>
                    <span className="font-mono">${Number(item.base_price).toFixed(2)} / {item.unit}</span>
                  </div>
                </button>
              ))}
              {filteredCatalog.length === 0 && (
                <p className="text-center text-muted-foreground text-xs py-8">No se encontraron reparaciones</p>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ─── Quotation dialogs (owner / tenant / contractor / work order) ─── */}
      {inspection && (
        <>
          <QuotationDialog
            open={quotationDialog.open}
            onOpenChange={(open) => setQuotationDialog((q) => ({ ...q, open }))}
            payer={quotationDialog.payer}
            inspection={inspection}
            repairs={allRepairs}
            operationalSections={operationalSections}
          />
          <ContractorQuotationDialog
            open={contractorQuotationOpen}
            onOpenChange={setContractorQuotationOpen}
            inspection={inspection}
            operationalSections={operationalSections}
            allRepairs={allRepairs}
            contractorName={selectedContractorName}
          />
          <WorkOrderDetailsDialog
            open={workOrderDetailsOpen}
            onOpenChange={setWorkOrderDetailsOpen}
            inspection={inspection}
            allRepairs={allRepairs}
            contractorName={selectedContractorName}
          />
        </>
      )}

      {/* ─── Quotation discount sheet ─── */}
      <QuotationDiscountSheet
        open={discountSheetOpen}
        onOpenChange={setDiscountSheetOpen}
        subtotalOwner={budgetBreakdown.ownerTotal}
        subtotalTenant={budgetBreakdown.tenantTotal}
        taxConfig={taxConfig}
        initial={activeDiscountInput}
        saving={discountState.saving}
        onSubmit={handleDiscountSubmit}
      />
    </AdminLayout>
  );
}

/* ─── Small helpers ─── */
function SummaryItem({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={cn('text-sm font-medium truncate', muted && 'text-muted-foreground')}>{value}</p>
    </div>
  );
}

