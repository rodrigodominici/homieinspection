import { useEffect, useState, useCallback } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
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
import { isSectionCompleted } from '@/lib/section-completion';
import { calculateProgress } from '@/lib/inspection-utils';
import type {
  Inspection, InspectionSection, InspectionFieldValue, InspectionPhoto,
  InspectionRepairItem, InspectionReportVersion, InspectionReview, Profile, WorkflowStage, RepairCatalogItem
} from '@/lib/types';
import {
  ArrowLeft, MapPin, Save, Check, Clock, ChevronDown, Copy,
  AlertTriangle, Package, Eye, EyeOff, History, FileText, Shield, DollarSign,
  ExternalLink, Share2, CheckCircle2, Link2, Trash2, Plus, Search
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

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
  'in_review', 'needs_changes', 'approved', 'published',
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

/* ─── groupBy helper ─── */
function groupBy<T extends { inspection_section_id: string }>(arr: T[]): Record<string, T[]> {
  const map: Record<string, T[]> = {};
  for (const item of arr) {
    if (!map[item.inspection_section_id]) map[item.inspection_section_id] = [];
    map[item.inspection_section_id].push(item);
  }
  return map;
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
  const [repairItems, setRepairItems] = useState<InspectionRepairItem[]>([]);
  const [reportVersions, setReportVersions] = useState<InspectionReportVersion[]>([]);
  const [reviews, setReviews] = useState<InspectionReview[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [sourceEvent, setSourceEvent] = useState<Record<string, unknown> | null>(null);
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Grouped data for review/budget tabs
  const [fieldsBySection, setFieldsBySection] = useState<Record<string, InspectionFieldValue[]>>({});
  const [photosBySection, setPhotosBySection] = useState<Record<string, InspectionPhoto[]>>({});
  const [reviewsBySection, setReviewsBySection] = useState<Record<string, InspectionReview[]>>({});
  const [repairsBySection, setRepairsBySection] = useState<Record<string, InspectionRepairItem[]>>({});

  // Editable fields
  const [editInspector, setEditInspector] = useState('');
  const [editExecutive, setEditExecutive] = useState('');
  const [editScheduledAt, setEditScheduledAt] = useState('');

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

  const fetchAll = useCallback(async () => {
    if (!id) return;
    const [inspRes, secRes, profilesRes] = await Promise.all([
      supabase.from('inspections').select('*').eq('id', id).single(),
      supabase.from('inspection_sections').select('*').eq('inspection_id', id).order('sort_order'),
      supabase.from('profiles').select('*').eq('is_active', true).order('full_name'),
    ]);

    const insp = inspRes.data as unknown as Inspection;
    const secs = (secRes.data ?? []) as unknown as InspectionSection[];
    const profs = (profilesRes.data ?? []) as unknown as Profile[];
    setInspection(insp);
    setSections(secs);
    setAllProfiles(profs);

    if (insp) {
      setEditInspector(insp.inspector_id ?? '');
      setEditExecutive(insp.executive_id ?? '');
      setEditScheduledAt(insp.scheduled_at ? insp.scheduled_at.slice(0, 16) : '');

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
        Promise.resolve(supabase.from('inspection_report_versions').select('*').eq('inspection_id', id).order('version_number', { ascending: false }))
          .then(r => { setReportVersions((r.data ?? []) as unknown as InspectionReportVersion[]); }),
        Promise.resolve(supabase.from('inspection_audit_log').select('*').eq('inspection_id', id).order('created_at', { ascending: false }))
          .then(r => { setAuditLog((r.data ?? []) as unknown as AuditLogEntry[]); }),
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
    const timestampField = `${fromStage}_completed_at`;
    const updates: Record<string, unknown> = {
      current_stage: toStage,
      [timestampField]: new Date().toISOString(),
      ...extraUpdates,
    };
    const { error } = await supabase.from('inspections').update(updates).eq('id', inspection.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      await logAudit('stage_advance', fromStage, toStage);
      toast({ title: `Avanzado a: ${WORKFLOW_STAGES.find(s => s.key === toStage)?.label}` });
      await fetchAll();
    }
    setSaving(false);
  };

  /* ─── Save assignment/schedule ─── */
  const handleSave = async () => {
    if (!inspection) return;
    setSaving(true);
    const updates: Record<string, unknown> = {
      inspector_id: editInspector || null,
      executive_id: editExecutive || null,
      scheduled_at: editScheduledAt ? new Date(editScheduledAt).toISOString() : null,
    };
    const { error } = await supabase.from('inspections').update(updates).eq('id', inspection.id);
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
    const { error } = await supabase.from('inspections').update({ status: forceStatusValue }).eq('id', inspection.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      await logAudit('force_advance', old, forceStatusValue, forceNote || undefined);
      toast({ title: `Estado cambiado a ${forceStatusValue}` });
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
      await supabase.from('inspection_photos').delete().eq('inspection_id', inspection.id);
      await supabase.from('inspection_reviews').delete().eq('inspection_id', inspection.id);
      await supabase.from('inspection_repair_items').delete().eq('inspection_id', inspection.id);
      await supabase.from('inspection_report_versions').delete().eq('inspection_id', inspection.id);
      await supabase.from('inspection_audit_log').delete().eq('inspection_id', inspection.id);
      await supabase.from('inspection_sections').delete().eq('inspection_id', inspection.id);
      const { error } = await supabase.from('inspections').delete().eq('id', inspection.id);
      if (error) throw error;
      toast({ title: 'Inspección eliminada' });
      navigate('/admin/inspections');
    } catch (err: any) {
      toast({ title: 'Error al eliminar', description: err.message, variant: 'destructive' });
    }
    setDeleting(false);
  };

  /* ─── Publish ─── */
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
        typology: inspection.typology,
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
          .map(p => ({ id: p.id, url: p.public_url, caption: p.caption })),
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

    await supabase.from('inspection_report_versions').update({ is_latest: false }).eq('inspection_id', id!);

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

    await logAudit('publish', inspection.status, 'published', `v${nextVersion}`);
    toast({ title: `Reporte v${nextVersion} publicado` });
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
    await supabase.from('inspection_repair_items').update({ [field]: value, updated_by: profile?.id }).eq('id', repairId);
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

  /* ─── Copy owner URL ─── */
  const getOwnerUrl = () => {
    const latest = reportVersions.find(v => v.is_latest && v.public_token);
    if (!latest || !inspection) return null;
    return `${window.location.origin}/reportes/${inspection.property_id}/${latest.public_token}`;
  };

  const copyOwnerUrl = () => {
    const url = getOwnerUrl();
    if (url) {
      navigator.clipboard.writeText(url);
      toast({ title: 'URL copiada al portapapeles' });
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
  const operationalSections = sections.filter(s => s.section_type !== 'property_meta');
  const budgetTotal = repairItems.reduce((sum, r) => sum + (r.subtotal ?? r.quantity * r.unit_price), 0);
  const isPublished = inspection?.status === 'published';
  const currentStage = (inspection?.current_stage ?? 'inspection') as WorkflowStage;
  const progress = calculateProgress(sections);

  const filteredCatalog = catalogItems.filter((i) =>
    !catalogSearch || i.name.toLowerCase().includes(catalogSearch.toLowerCase()) || (i.owner_friendly_name ?? '').toLowerCase().includes(catalogSearch.toLowerCase())
  );

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
              <SummaryItem
                label="Programada"
                value={inspection.scheduled_at ? format(new Date(inspection.scheduled_at), 'dd MMM yyyy HH:mm', { locale: es }) : '—'}
                muted={!inspection.scheduled_at}
              />
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
              {currentStage === 'share' && !isPublished && (
                <Button onClick={handlePublish} disabled={publishing} className="gap-2">
                  <ExternalLink className="h-4 w-4" /> {publishing ? 'Publicando...' : 'Publicar y Generar URL'}
                </Button>
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Fecha/Hora programada</Label>
                <Input type="datetime-local" value={editScheduledAt} onChange={(e) => setEditScheduledAt(e.target.value)} />
              </div>
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

        {/* ─── Property Briefing Card ─── */}
        <PropertyBriefingCard inspection={inspection} />

        {/* ─── Detail Tabs ─── */}
        <Tabs defaultValue="inspection" className="w-full">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="payload" className="gap-1.5"><Package className="h-3.5 w-3.5" /> Payload</TabsTrigger>
            <TabsTrigger value="inspection" className="gap-1.5"><FileText className="h-3.5 w-3.5" /> Inspección</TabsTrigger>
            <TabsTrigger value="review" className="gap-1.5"><Shield className="h-3.5 w-3.5" /> Revisión</TabsTrigger>
            <TabsTrigger value="budget" className="gap-1.5"><DollarSign className="h-3.5 w-3.5" /> Presupuesto</TabsTrigger>
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

          {/* ── Inspection tab — FIXED progress: uses section status, not field counts ── */}
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
                  return (
                    <Collapsible key={sec.id}>
                      <CollapsibleTrigger className="flex items-center gap-3 w-full py-2.5 px-3 rounded-lg hover:bg-muted/50 transition-colors text-left">
                        <span className="text-xs text-muted-foreground w-5 text-right shrink-0">{idx + 1}</span>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium">{sec.section_title}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={cn('text-[10px] font-medium', completed ? 'text-green-600' : 'text-muted-foreground')}>
                            {completed ? '100%' : '0%'}
                          </span>
                          <SectionStatusBadge status={sec.status} />
                          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pl-11 pr-3 pb-3">
                        <div className="space-y-1.5">
                          <p className="text-xs text-muted-foreground">
                            {secFields.length} campos · {secPhotos.length} fotos
                          </p>
                          {secFields.filter(f => f.value_text).slice(0, 5).map(f => (
                            <div key={f.id} className="flex gap-2 text-xs">
                              <span className="text-muted-foreground shrink-0">{f.field_label}:</span>
                              <span className="truncate">{f.value_text}</span>
                            </div>
                          ))}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Review tab — full executive capabilities ── */}
          <TabsContent value="review">
            <div className="space-y-4">
              {sections.length === 0 && (
                <Card className="border-0 ring-1 ring-border shadow-sm">
                  <CardContent className="p-4"><p className="text-sm text-muted-foreground">No hay secciones.</p></CardContent>
                </Card>
              )}
              {sections.map(section => {
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
                  <span className="text-sm font-medium">Total Presupuesto</span>
                  <span className="text-lg font-semibold text-primary font-mono">${budgetTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                </CardContent>
              </Card>

              {/* Per-section budget */}
              {sections.map(section => {
                const sRepairs = repairsBySection[section.id] ?? [];
                const sectionSubtotal = sRepairs.filter(r => r.visible_to_owner).reduce((s, r) => s + Number(r.subtotal ?? r.quantity * r.unit_price), 0);

                return (
                  <Card key={section.id} className="border-0 ring-1 ring-border shadow-sm">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm">{section.section_title}</CardTitle>
                        <Button size="sm" variant="outline" onClick={() => openCatalog(section.id)}>
                          <Plus className="mr-1 h-3.5 w-3.5" /> Agregar
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {sRepairs.length === 0 && (
                        <p className="text-xs text-muted-foreground">Sin reparaciones en esta sección.</p>
                      )}
                      {sRepairs.map((repair) => (
                        <div key={repair.id} className={cn('rounded-lg border p-3 space-y-2', !repair.visible_to_owner && 'opacity-50 border-dashed')}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate">{repair.title_snapshot}</p>
                              {repair.category_snapshot && <p className="text-[10px] text-muted-foreground">{repair.category_snapshot}</p>}
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
                              <Label className="text-[10px]">Cantidad</Label>
                              <Input type="number" step="0.01" value={repair.quantity}
                                onChange={(e) => updateRepairItem(repair.id, 'quantity', parseFloat(e.target.value) || 0)}
                                className="h-8 text-xs" />
                            </div>
                            <div>
                              <Label className="text-[10px]">Precio unit.</Label>
                              <Input type="number" step="0.01" value={repair.unit_price}
                                onChange={(e) => updateRepairItem(repair.id, 'unit_price', parseFloat(e.target.value) || 0)}
                                className="h-8 text-xs" />
                            </div>
                            <div>
                              <Label className="text-[10px]">Subtotal</Label>
                              <p className="h-8 flex items-center text-xs font-mono font-medium">
                                ${Number(repair.subtotal ?? repair.quantity * repair.unit_price).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                              </p>
                            </div>
                          </div>
                          <Input placeholder="Notas..." value={repair.notes ?? ''} className="h-8 text-xs"
                            onChange={(e) => updateRepairItem(repair.id, 'notes', e.target.value || null)} />
                        </div>
                      ))}
                      {sectionSubtotal > 0 && (
                        <div className="flex justify-end text-xs font-medium font-mono pt-1">
                          Subtotal: ${sectionSubtotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}

              {/* Published versions */}
              <Card className="border-0 ring-1 ring-border shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Versiones Publicadas</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {reportVersions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No hay versiones publicadas.</p>
                  ) : (
                    reportVersions.map(v => (
                      <div key={v.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                        <span className={cn('text-sm font-medium', v.is_latest && 'text-primary')}>
                          v{v.version_number}
                        </span>
                        {v.is_latest && <span className="text-[10px] uppercase bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-semibold">Última</span>}
                        <span className="text-xs text-muted-foreground flex-1">
                          {format(new Date(v.created_at), 'dd MMM yyyy HH:mm', { locale: es })}
                        </span>
                        {v.public_token && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 text-xs"
                            onClick={() => {
                              const url = `${window.location.origin}/reportes/${inspection.property_id}/${v.public_token}`;
                              navigator.clipboard.writeText(url);
                              toast({ title: 'URL copiada' });
                            }}
                          >
                            <Copy className="h-3 w-3" /> Copiar
                          </Button>
                        )}
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
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
