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
  InspectionRepairItem, InspectionReportVersion, InspectionReview, Profile
} from '@/lib/types';
import {
  ArrowLeft, MapPin, Save, Check, Circle, Clock, ChevronDown, Copy,
  RefreshCw, Send, User, Shield, FileText, DollarSign, ExternalLink,
  AlertTriangle, Package, Eye, History
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

/* ─── Status constants ─── */
const STATUS_ORDER = [
  'pending', 'pending_assignment', 'assigned', 'in_progress', 'submitted',
  'in_review', 'needs_changes', 'approved', 'published', 'sent',
];

const ALL_STATUSES = [
  'pending_assignment', 'assigned', 'in_progress', 'submitted',
  'in_review', 'needs_changes', 'approved', 'published', 'sent',
];

/* ─── Stage definitions ─── */
interface WorkflowStage {
  key: string;
  label: string;
  icon: React.ElementType;
  isCompleted: (ctx: StageContext) => boolean;
  isCurrent: (ctx: StageContext) => boolean;
  getTimestamp: (ctx: StageContext) => string | null;
  getUser: (ctx: StageContext) => string | null;
}

interface StageContext {
  inspection: Inspection;
  sections: InspectionSection[];
  repairItems: InspectionRepairItem[];
  reportVersions: InspectionReportVersion[];
  sourceEvent: Record<string, unknown> | null;
  inspectorName: string | null;
  executiveName: string | null;
}

interface AuditLogEntry {
  id: string;
  inspection_id: string;
  previous_status: string | null;
  new_status: string | null;
  action: string;
  performed_by: string | null;
  note: string | null;
  created_at: string;
  performer?: Profile;
}

function statusIndex(s: string) {
  const idx = STATUS_ORDER.indexOf(s);
  return idx === -1 ? 0 : idx;
}

const STAGES: WorkflowStage[] = [
  {
    key: 'payload',
    label: 'Payload recibido',
    icon: Package,
    isCompleted: (c) => !!c.inspection.source_event_id,
    isCurrent: () => false,
    getTimestamp: (c) => c.inspection.created_at,
    getUser: () => null,
  },
  {
    key: 'generated',
    label: 'Inspección generada',
    icon: FileText,
    isCompleted: (c) => c.sections.length > 0,
    isCurrent: (c) => c.sections.length === 0 && !!c.inspection.source_event_id,
    getTimestamp: (c) => c.sections.length > 0 ? c.inspection.created_at : null,
    getUser: () => null,
  },
  {
    key: 'assignment',
    label: 'Asignación completa',
    icon: User,
    isCompleted: (c) => !!c.inspection.inspector_id && !!c.inspection.executive_id,
    isCurrent: (c) => c.sections.length > 0 && (!c.inspection.inspector_id || !c.inspection.executive_id),
    getTimestamp: (c) => (!!c.inspection.inspector_id && !!c.inspection.executive_id) ? c.inspection.updated_at : null,
    getUser: () => null,
  },
  {
    key: 'execution',
    label: 'Ejecución inspector',
    icon: Eye,
    isCompleted: (c) => statusIndex(c.inspection.status) >= statusIndex('submitted'),
    isCurrent: (c) => c.inspection.status === 'in_progress' || c.inspection.status === 'assigned',
    getTimestamp: (c) => c.inspection.started_at,
    getUser: (c) => c.inspectorName,
  },
  {
    key: 'submitted',
    label: 'Enviada a revisión',
    icon: Send,
    isCompleted: (c) => statusIndex(c.inspection.status) >= statusIndex('submitted'),
    isCurrent: () => false,
    getTimestamp: (c) => c.inspection.completed_at,
    getUser: (c) => c.inspectorName,
  },
  {
    key: 'review',
    label: 'Revisión ejecutivo',
    icon: Shield,
    isCompleted: (c) => statusIndex(c.inspection.status) >= statusIndex('approved'),
    isCurrent: (c) => c.inspection.status === 'in_review' || c.inspection.status === 'submitted',
    getTimestamp: (c) => c.inspection.approved_at,
    getUser: (c) => c.executiveName,
  },
  {
    key: 'budget',
    label: 'Presupuesto',
    icon: DollarSign,
    isCompleted: (c) => c.repairItems.length > 0,
    isCurrent: (c) => statusIndex(c.inspection.status) >= statusIndex('in_review') && c.repairItems.length === 0,
    getTimestamp: () => null,
    getUser: (c) => c.executiveName,
  },
  {
    key: 'publication',
    label: 'Publicación',
    icon: ExternalLink,
    isCompleted: (c) => c.reportVersions.length > 0,
    isCurrent: (c) => c.inspection.status === 'approved' && c.reportVersions.length === 0,
    getTimestamp: (c) => c.reportVersions[0]?.created_at ?? null,
    getUser: () => null,
  },
  {
    key: 'owner_url',
    label: 'URL propietario',
    icon: Copy,
    isCompleted: (c) => c.reportVersions.some(v => !!v.public_token),
    isCurrent: () => false,
    getTimestamp: (c) => {
      const v = c.reportVersions.find(v => !!v.public_token);
      return v?.created_at ?? null;
    },
    getUser: () => null,
  },
  {
    key: 'sent',
    label: 'Enviada / Compartida',
    icon: Check,
    isCompleted: (c) => c.inspection.status === 'sent',
    isCurrent: (c) => c.inspection.status === 'published',
    getTimestamp: () => null,
    getUser: () => null,
  },
];

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
  const [editStatus, setEditStatus] = useState('');
  const [editInspector, setEditInspector] = useState('');
  const [editExecutive, setEditExecutive] = useState('');
  const [editScheduledAt, setEditScheduledAt] = useState('');

  // Force advance dialog
  const [forceStatusOpen, setForceStatusOpen] = useState(false);
  const [forceStatusValue, setForceStatusValue] = useState('');
  const [forceNote, setForceNote] = useState('');

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
      setEditStatus(insp.status);
      setEditInspector(insp.inspector_id ?? '');
      setEditExecutive(insp.executive_id ?? '');
      setEditScheduledAt(insp.scheduled_at ? insp.scheduled_at.slice(0, 16) : '');

      // Parallel fetch of related data
      const sectionIds = secs.map(s => s.id);
      const promises: Promise<void>[] = [];

      if (sectionIds.length > 0) {
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

  /* ─── Save handler ─── */
  const handleSave = async () => {
    if (!inspection) return;
    setSaving(true);
    const oldStatus = inspection.status;
    const updates: Record<string, unknown> = {
      status: editStatus,
      inspector_id: editInspector || null,
      executive_id: editExecutive || null,
      scheduled_at: editScheduledAt ? new Date(editScheduledAt).toISOString() : null,
    };
    const { error } = await supabase.from('inspections').update(updates).eq('id', inspection.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      if (oldStatus !== editStatus) {
        await logAudit('status_change', oldStatus, editStatus);
      }
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

  /* ─── Mark as sent ─── */
  const handleMarkSent = async () => {
    if (!inspection) return;
    const old = inspection.status;
    const { error } = await supabase.from('inspections').update({ status: 'sent' }).eq('id', inspection.id);
    if (!error) {
      await logAudit('mark_sent', old, 'sent');
      toast({ title: 'Marcada como enviada' });
      await fetchAll();
    }
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

  const stageCtx: StageContext = {
    inspection,
    sections,
    repairItems,
    reportVersions,
    sourceEvent,
    inspectorName,
    executiveName,
  };

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 max-w-6xl space-y-6">
        {/* ─── Header ─── */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin/inspections')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-h3 truncate">{inspection.property_name ?? inspection.property_id}</h1>
            <p className="text-caption text-muted-foreground flex items-center gap-1">
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

        {/* ─── Workflow Timeline ─── */}
        <Card className="border-0 ring-1 ring-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-body-lg flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Flujo de Trabajo
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="relative ml-4">
              {/* vertical line */}
              <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-border" />
              {STAGES.map((stage, i) => {
                const completed = stage.isCompleted(stageCtx);
                const current = stage.isCurrent(stageCtx);
                const ts = stage.getTimestamp(stageCtx);
                const user = stage.getUser(stageCtx);
                const Icon = stage.icon;
                return (
                  <div key={stage.key} className="relative flex items-start gap-4 pb-5 last:pb-0">
                    {/* dot */}
                    <div className={cn(
                      'relative z-10 flex items-center justify-center w-6 h-6 rounded-full border-2 shrink-0',
                      completed
                        ? 'bg-primary border-primary text-primary-foreground'
                        : current
                          ? 'bg-background border-primary text-primary animate-pulse'
                          : 'bg-muted border-border text-muted-foreground'
                    )}>
                      {completed ? <Check className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
                    </div>
                    {/* content */}
                    <div className="flex-1 min-w-0 -mt-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn('text-sm font-medium', completed ? 'text-foreground' : current ? 'text-primary' : 'text-muted-foreground')}>
                          {stage.label}
                        </span>
                        {current && <span className="text-[10px] uppercase tracking-wider font-semibold text-primary bg-primary/10 rounded-full px-2 py-0.5">Actual</span>}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-caption text-muted-foreground">
                        {ts && <span>{format(new Date(ts), 'dd MMM yyyy HH:mm', { locale: es })}</span>}
                        {user && <span>· {user}</span>}
                      </div>
                      {/* stage-specific actions */}
                      {stage.key === 'owner_url' && ownerUrl && (
                        <Button variant="outline" size="sm" className="mt-2 gap-1.5 h-7 text-xs" onClick={copyOwnerUrl}>
                          <Copy className="h-3 w-3" /> Copiar URL
                        </Button>
                      )}
                      {stage.key === 'sent' && current && (
                        <Button variant="outline" size="sm" className="mt-2 gap-1.5 h-7 text-xs" onClick={handleMarkSent}>
                          <Send className="h-3 w-3" /> Marcar como enviada
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* ─── Admin Actions Bar ─── */}
        <Card className="border-0 ring-1 ring-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-body-lg">Acciones Administrativas</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Estado</Label>
                <Select value={editStatus} onValueChange={setEditStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ALL_STATUSES.map(s => (
                      <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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

              {ownerUrl && (
                <Button variant="outline" className="gap-2" onClick={copyOwnerUrl}>
                  <Copy className="h-4 w-4" /> Copiar URL Propietario
                </Button>
              )}
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
                <CardTitle className="text-body-lg">Property Snapshot</CardTitle>
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
                  <CardTitle className="text-body-lg">Source Event Payload</CardTitle>
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
                <CardTitle className="text-body-lg">Secciones ({sections.length})</CardTitle>
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
                        <span className="text-caption text-muted-foreground w-5 text-right shrink-0">{idx + 1}</span>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium">{sec.section_title}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {total > 0 && (
                            <span className="text-[10px] font-medium text-muted-foreground">{pct}%</span>
                          )}
                          <SectionStatusBadge status={sec.status} />
                          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pl-11 pr-3 pb-3">
                        <div className="space-y-1.5">
                          {/* Progress bar */}
                          {total > 0 && (
                            <div className="w-full bg-muted rounded-full h-1.5">
                              <div className="bg-primary rounded-full h-1.5 transition-all" style={{ width: `${pct}%` }} />
                            </div>
                          )}
                          <p className="text-caption text-muted-foreground">
                            {filled}/{total} campos · {secPhotos.length} fotos
                          </p>
                          {/* field summary */}
                          {secFields.filter(f => f.value_text).slice(0, 5).map(f => (
                            <div key={f.id} className="flex gap-2 text-caption">
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
                <CardTitle className="text-body-lg">Revisión Ejecutivo</CardTitle>
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
                      <div className="flex gap-4 text-caption text-muted-foreground">
                        <span>{secReviews.length} notas</span>
                        <span>{secPhotos.length} fotos</span>
                        <span>{secRepairs.length} reparaciones</span>
                      </div>
                      {secReviews.length > 0 && (
                        <div className="space-y-1">
                          {secReviews.map(r => (
                            <div key={r.id} className="text-caption border-l-2 border-primary/30 pl-2">
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
              {/* Budget table */}
              <Card className="border-0 ring-1 ring-border shadow-sm">
                <CardHeader>
                  <CardTitle className="text-body-lg flex items-center justify-between">
                    <span>Presupuesto</span>
                    <span className="text-h4 text-primary">${budgetTotal.toLocaleString('es-CL')}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {repairItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No hay ítems de reparación.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left text-caption text-muted-foreground">
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
                                  {item.notes && <p className="text-caption text-muted-foreground">{item.notes}</p>}
                                </td>
                                <td className="py-2 pr-2 text-caption text-muted-foreground">{sec?.section_title ?? '—'}</td>
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
                  <CardTitle className="text-body-lg">Versiones Publicadas</CardTitle>
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
                        <span className="text-caption text-muted-foreground flex-1">
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
                <CardTitle className="text-body-lg flex items-center gap-2">
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
                          {entry.note && <p className="text-caption text-muted-foreground mt-0.5">{entry.note}</p>}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-caption text-muted-foreground">{performer?.full_name ?? 'Sistema'}</p>
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
