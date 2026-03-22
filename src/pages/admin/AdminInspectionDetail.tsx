import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { InspectionStatusBadge, SectionStatusBadge } from '@/components/StatusBadge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import AdminLayout from '@/components/AdminLayout';
import type {
  Inspection, InspectionSection, InspectionFieldValue, InspectionPhoto,
  InspectionRepairItem, InspectionReportVersion, InspectionReview, Profile, WorkflowStage
} from '@/lib/types';
import {
  ArrowLeft, MapPin, Save, Check, Clock, ChevronDown, Copy,
  AlertTriangle, Package, Eye, History, FileText, Shield, DollarSign,
  ExternalLink, Share2, CheckCircle2, Link2
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

/* ─── Status constants (for force advance / legacy) ─── */
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

      const promises: Promise<void>[] = [];

      if (secs.length > 0) {
        promises.push(
          Promise.resolve(supabase.from('inspection_field_values').select('*').eq('inspection_id', id).order('sort_order'))
            .then(r => { setFieldValues((r.data ?? []) as unknown as InspectionFieldValue[]); }),
          Promise.resolve(supabase.from('inspection_photos').select('*').eq('inspection_id', id).order('sort_order'))
            .then(r => { setPhotos((r.data ?? []) as unknown as InspectionPhoto[]); }),
          Promise.resolve(supabase.from('inspection_reviews').select('*').eq('inspection_id', id).order('created_at', { ascending: false }))
            .then(r => { setReviews((r.data ?? []) as unknown as InspectionReview[]); }),
        );
      }

      promises.push(
        Promise.resolve(supabase.from('inspection_repair_items').select('*').eq('inspection_id', id).order('sort_order'))
          .then(r => { setRepairItems((r.data ?? []) as unknown as InspectionRepairItem[]); }),
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

  /* ─── Publish ─── */
  const handlePublish = async () => {
    if (!inspection) return;
    setPublishing(true);

    // Build normalized payload
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
        final_observation: s.final_observation,
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

    // Get next version
    const { data: existing } = await supabase
      .from('inspection_report_versions')
      .select('version_number')
      .eq('inspection_id', id!)
      .order('version_number', { ascending: false })
      .limit(1);
    const nextVersion = ((existing?.[0] as any)?.version_number ?? 0) + 1;

    // Set previous versions to not latest
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
      setPublishing(false);
      return;
    }

    // Update inspection
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

  /* ─── Derived data ─── */
  const inspectors = allProfiles.filter(p => p.role === 'inspector');
  const executives = allProfiles.filter(p => p.role === 'executive');
  const inspectorName = allProfiles.find(p => p.id === inspection?.inspector_id)?.full_name ?? null;
  const executiveName = allProfiles.find(p => p.id === inspection?.executive_id)?.full_name ?? null;
  const ownerUrl = getOwnerUrl();
  const budgetTotal = repairItems.reduce((sum, r) => sum + (r.subtotal ?? r.quantity * r.unit_price), 0);
  const isPublished = inspection?.status === 'published';
  const currentStage = (inspection?.current_stage ?? 'inspection') as WorkflowStage;

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
            {/* Horizontal stepper */}
            <div className="flex items-center gap-0">
              {WORKFLOW_STAGES.map((stage, i) => {
                const currentIdx = stageIndex(currentStage);
                const thisIdx = stageIndex(stage.key);
                const isCompleted = thisIdx < currentIdx || (stage.key === 'share' && isPublished);
                const isCurrent = stage.key === currentStage && !isPublished;
                const isPending = thisIdx > currentIdx && !(stage.key === 'share' && isPublished);
                const Icon = stage.icon;

                // Get timestamp
                let timestamp: string | null = null;
                if (stage.key === 'inspection') timestamp = inspection.inspection_completed_at;
                else if (stage.key === 'review') timestamp = inspection.review_completed_at;
                else if (stage.key === 'budget') timestamp = inspection.budget_completed_at;
                else if (stage.key === 'share') timestamp = inspection.published_at;

                return (
                  <div key={stage.key} className="flex items-center flex-1 last:flex-initial">
                    <div className="flex flex-col items-center gap-1.5 min-w-0">
                      {/* Circle */}
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
                      {/* Label */}
                      <span className={cn(
                        'text-xs font-medium text-center',
                        isCompleted ? 'text-foreground' : isCurrent ? 'text-primary' : 'text-muted-foreground'
                      )}>
                        {stage.label}
                      </span>
                      {/* Timestamp */}
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
                    {/* Connector line */}
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
            </div>
          </CardContent>
        </Card>

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

          {/* ── Inspection tab ── */}
          <TabsContent value="inspection">
            <Card className="border-0 ring-1 ring-border shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Secciones ({sections.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {sections.length === 0 && <p className="text-sm text-muted-foreground">No hay secciones generadas.</p>}
                {sections.map((sec, idx) => {
                  const secFields = fieldValues.filter(fv => fv.inspection_section_id === sec.id);
                  const secPhotos = photos.filter(p => p.inspection_section_id === sec.id);
                  const filled = secFields.filter(f => f.value_text || f.value_json).length;
                  const total = secFields.length;
                  const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
                  return (
                    <Collapsible key={sec.id}>
                      <CollapsibleTrigger className="flex items-center gap-3 w-full py-2.5 px-3 rounded-lg hover:bg-muted/50 transition-colors text-left">
                        <span className="text-xs text-muted-foreground w-5 text-right shrink-0">{idx + 1}</span>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium">{sec.section_title}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {total > 0 && <span className="text-[10px] font-medium text-muted-foreground">{pct}%</span>}
                          <SectionStatusBadge status={sec.status} />
                          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pl-11 pr-3 pb-3">
                        <div className="space-y-1.5">
                          {total > 0 && (
                            <div className="w-full bg-muted rounded-full h-1.5">
                              <div className="bg-primary rounded-full h-1.5 transition-all" style={{ width: `${pct}%` }} />
                            </div>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {filled}/{total} campos · {secPhotos.length} fotos
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

          {/* ── Review tab ── */}
          <TabsContent value="review">
            <Card className="border-0 ring-1 ring-border shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Revisión Ejecutivo</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {sections.length === 0 && <p className="text-sm text-muted-foreground">No hay secciones.</p>}
                {sections.map(sec => {
                  const secReviews = reviews.filter(r => r.inspection_section_id === sec.id);
                  const secRepairs = repairItems.filter(r => r.inspection_section_id === sec.id);
                  const secPhotos = photos.filter(p => p.inspection_section_id === sec.id);
                  return (
                    <div key={sec.id} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{sec.section_title}</span>
                        <SectionStatusBadge status={sec.status} />
                      </div>
                      {sec.final_observation && (
                        <div className="bg-muted/40 rounded-lg p-2.5">
                          <p className="text-[10px] uppercase font-semibold text-muted-foreground mb-1">Observación final</p>
                          <p className="text-sm">{sec.final_observation}</p>
                        </div>
                      )}
                      <div className="flex gap-4 text-xs text-muted-foreground">
                        <span>{secReviews.length} notas</span>
                        <span>{secPhotos.length} fotos</span>
                        <span>{secRepairs.length} reparaciones</span>
                      </div>
                      {secReviews.length > 0 && (
                        <div className="space-y-1">
                          {secReviews.map(r => (
                            <div key={r.id} className="text-xs border-l-2 border-primary/30 pl-2">
                              <span className="text-muted-foreground">[{r.comment_type}]</span> {r.comment}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Budget tab ── */}
          <TabsContent value="budget">
            <div className="space-y-4">
              <Card className="border-0 ring-1 ring-border shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base flex items-center justify-between">
                    <span>Presupuesto</span>
                    <span className="text-lg font-semibold text-primary">${budgetTotal.toLocaleString('es-CL')}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {repairItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No hay ítems de reparación.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left text-xs text-muted-foreground">
                            <th className="pb-2 pr-2">Ítem</th>
                            <th className="pb-2 pr-2">Sección</th>
                            <th className="pb-2 pr-2 text-right">Cant.</th>
                            <th className="pb-2 pr-2 text-right">Precio</th>
                            <th className="pb-2 text-right">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {repairItems.map(item => {
                            const sec = sections.find(s => s.id === item.inspection_section_id);
                            return (
                              <tr key={item.id} className="border-b last:border-0">
                                <td className="py-2 pr-2">
                                  <span className="font-medium">{item.title_snapshot}</span>
                                  {item.notes && <p className="text-xs text-muted-foreground">{item.notes}</p>}
                                </td>
                                <td className="py-2 pr-2 text-xs text-muted-foreground">{sec?.section_title ?? '—'}</td>
                                <td className="py-2 pr-2 text-right">{item.quantity}</td>
                                <td className="py-2 pr-2 text-right">${Number(item.unit_price).toLocaleString('es-CL')}</td>
                                <td className="py-2 text-right font-medium">${(item.subtotal ?? item.quantity * item.unit_price).toLocaleString('es-CL')}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>

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
