import { useEffect, useState, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { InspectionStatusBadge } from '@/components/StatusBadge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { createInspectionFromPayload } from '@/lib/inspection-service';
import { EXAMPLE_PAYLOADS } from '@/lib/inspection-generator';
import { getEffectiveSnapshot } from '@/lib/inspection-utils';
import AdminLayout from '@/components/AdminLayout';
import type { Inspection, Profile } from '@/lib/types';
import {
  UserCheck, AlertCircle, Zap, Search, ExternalLink, MapPin, User, UserCog,
  Calendar as CalendarIcon, FileText, Briefcase, Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const payloadOptions = [
  { key: 'studio', label: 'Estudio — 0D 1B, terraza + logia' },
  { key: 'twoBedTwoBath', label: '2D 2B — con bodega y estacionamiento' },
  { key: 'houseWithYard', label: 'Casa 3D 2B — con antejardín' },
  { key: 'fullFeatures', label: '4D 4B — todas las características' },
];

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos los estados' },
  { value: 'pending_assignment', label: 'Sin Asignar' },
  { value: 'assigned', label: 'Asignada' },
  { value: 'in_progress', label: 'En Progreso' },
  { value: 'submitted', label: 'Enviada' },
  { value: 'in_review', label: 'En Revisión' },
  { value: 'needs_changes', label: 'Necesita Cambios' },
  { value: 'approved', label: 'Aprobada' },
  { value: 'published', label: 'Publicada' },
  { value: 'sent', label: 'Enviada al cliente' },
];

const SORT_OPTIONS = [
  { value: 'priority', label: 'Prioridad operativa' },
  { value: 'latest', label: 'Última actividad' },
  { value: 'contract_asc', label: 'Término contrato ↑' },
  { value: 'contract_desc', label: 'Término contrato ↓' },
  { value: 'schedule_asc', label: 'Recolección llaves ↑' },
  { value: 'schedule_desc', label: 'Recolección llaves ↓' },
];

// Quick-filter buckets
type Bucket = 'all' | 'unassigned' | 'por_coordinar' | 'programadas' | 'in_progress';
const BUCKET_FILTERS: { value: Bucket; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'unassigned', label: 'Sin asignar' },
  { value: 'por_coordinar', label: 'Por coordinar' },
  { value: 'programadas', label: 'Programadas' },
  { value: 'in_progress', label: 'En progreso' },
];

function nullSafeSort(a: Date | null, b: Date | null, asc: boolean): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return asc ? a.getTime() - b.getTime() : b.getTime() - a.getTime();
}

function parseDateField(val: unknown): Date | null {
  if (!val || typeof val !== 'string') return null;
  const dt = new Date(`${val}T00:00:00`);
  return isNaN(dt.getTime()) ? null : dt;
}

function parseDateTimeField(fecha: unknown, hora: unknown): Date | null {
  if (!fecha || typeof fecha !== 'string') return null;
  const dt = new Date(`${fecha}T${(hora && typeof hora === 'string') ? hora : '00:00'}`);
  return isNaN(dt.getTime()) ? null : dt;
}

interface EnrichedInspection extends Inspection {
  scheduleDatetime: Date | null;
  contractEndDate: Date | null;
  inspectorName: string | null;
  executiveName: string | null;
}

/**
 * Operational priority bucket for admin sorting/filtering.
 * Lower number = higher priority. Unassigned ALWAYS outranks date urgency.
 */
function priorityBucket(insp: EnrichedInspection): number {
  const missingAssign = !insp.inspector_id || !insp.executive_id || insp.status === 'pending_assignment';
  if (missingAssign) return 0; // Sin asignar
  const terminal = ['published', 'sent', 'approved'].includes(insp.status);
  if (terminal) return 5;
  if (insp.status === 'in_progress' || insp.status === 'submitted' || insp.status === 'in_review' || insp.status === 'needs_changes') return 3;
  // assigned
  if (!insp.scheduleDatetime) return 1; // Por coordinar
  return 2; // Programadas
}

function bucketLabel(b: number): { label: string; className: string } {
  switch (b) {
    case 0: return { label: 'Sin asignar', className: 'bg-status-bad-bg text-status-bad' };
    case 1: return { label: 'Por coordinar', className: 'bg-amber-50 text-amber-700' };
    case 2: return { label: 'Programada', className: 'bg-status-regular-bg text-status-regular' };
    case 3: return { label: 'En progreso', className: 'bg-primary/10 text-primary' };
    default: return { label: 'Completada', className: 'bg-status-good-bg text-status-good' };
  }
}

function missingAssignmentLabel(insp: EnrichedInspection): string | null {
  const noI = !insp.inspector_id;
  const noE = !insp.executive_id;
  if (noI && noE) return 'Faltan ambos';
  if (noI) return 'Falta inspector';
  if (noE) return 'Falta ejecutivo';
  return null;
}

export default function AdminInspections() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') ?? 'all';

  const [inspections, setInspections] = useState<EnrichedInspection[]>([]);
  const [inspectors, setInspectors] = useState<Profile[]>([]);
  const [executives, setExecutives] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [inspectorFilter, setInspectorFilter] = useState<string>('all');
  const [executiveFilter, setExecutiveFilter] = useState<string>('all');
  const [bucketFilter, setBucketFilter] = useState<Bucket>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('priority');

  // Assignment state
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [assignInspector, setAssignInspector] = useState('');
  const [assignExecutive, setAssignExecutive] = useState('');

  // Creation state
  const [selectedExample, setSelectedExample] = useState('studio');
  const [payloadText, setPayloadText] = useState(JSON.stringify(EXAMPLE_PAYLOADS.studio, null, 2));
  const [selectedInspectorId, setSelectedInspectorId] = useState('');
  const [selectedExecutiveId, setSelectedExecutiveId] = useState('');
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    const fetchAll = async () => {
      const [inspRes, profilesRes] = await Promise.all([
        supabase
          .from('inspections')
          .select('*, inspector:profiles!inspections_inspector_id_fkey(full_name), executive:profiles!inspections_executive_id_fkey(full_name)')
          .order('updated_at', { ascending: false }),
        supabase.from('profiles').select('*').eq('is_active', true).order('full_name'),
      ]);

      const profiles = (profilesRes.data ?? []) as unknown as Profile[];
      setInspectors(profiles.filter((p) => p.role === 'inspector'));
      setExecutives(profiles.filter((p) => p.role === 'executive'));

      const rawItems = (inspRes.data ?? []) as unknown as (Inspection & {
        inspector: { full_name: string } | null;
        executive: { full_name: string } | null;
      })[];
      const enriched: EnrichedInspection[] = rawItems.map((insp) => {
        const snapshot = getEffectiveSnapshot(insp);
        const scheduleDatetime = parseDateTimeField(
          snapshot?.fecha_recoleccion_llaves,
          snapshot?.hora_recoleccion_llaves
        );
        const contractEndDate = parseDateField(snapshot?.fecha_de_termino_real_de_contrato);
        return {
          ...insp,
          scheduleDatetime,
          contractEndDate,
          inspectorName: insp.inspector?.full_name ?? null,
          executiveName: insp.executive?.full_name ?? null,
        };
      });

      setInspections(enriched);
      setLoading(false);
    };
    fetchAll();
  }, []);

  const handleAssign = async (inspectionId: string) => {
    if (!assignInspector || !assignExecutive) {
      toast({ title: 'Selecciona ambos roles', variant: 'destructive' });
      return;
    }
    const { error } = await supabase
      .from('inspections')
      .update({ inspector_id: assignInspector, executive_id: assignExecutive, status: 'assigned' })
      .eq('id', inspectionId);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Inspección asignada' });
      const inspectorName = inspectors.find(p => p.id === assignInspector)?.full_name ?? null;
      const executiveName = executives.find(p => p.id === assignExecutive)?.full_name ?? null;
      setInspections((prev) =>
        prev.map((i) =>
          i.id === inspectionId
            ? { ...i, inspector_id: assignInspector, executive_id: assignExecutive, status: 'assigned' as const, inspectorName, executiveName }
            : i
        )
      );
      setAssigningId(null);
    }
  };

  const handleExampleChange = (key: string) => {
    setSelectedExample(key);
    setPayloadText(JSON.stringify(EXAMPLE_PAYLOADS[key as keyof typeof EXAMPLE_PAYLOADS], null, 2));
  };

  const handleGenerate = async () => {
    if (!profile) return;
    if (!selectedInspectorId || !selectedExecutiveId) {
      toast({ title: 'Asignación requerida', description: 'Selecciona inspector y ejecutivo.', variant: 'destructive' });
      return;
    }
    setGenerating(true);
    try {
      const payload = JSON.parse(payloadText);
      payload.inspector = { ...(payload.inspector ?? {}), id: selectedInspectorId };
      payload.executive = { ...(payload.executive ?? {}), id: selectedExecutiveId };
      const inspection = await createInspectionFromPayload(payload, profile.id);
      toast({ title: 'Inspección creada', description: `ID: ${inspection.property_id}` });
      setInspections((prev) => [{
        ...(inspection as unknown as Inspection),
        scheduleDatetime: null,
        contractEndDate: null,
        inspectorName: null,
        executiveName: null,
      }, ...prev]);
      setSearchParams({ tab: 'all' });
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const pendingAssignment = inspections.filter((i) => i.status === 'pending_assignment' || !i.inspector_id || !i.executive_id);

  // Apply all filters + sorting
  const filteredInspections = useMemo(() => {
    const result = inspections.filter((i) => {
      if (statusFilter !== 'all' && i.status !== statusFilter) return false;
      if (inspectorFilter !== 'all' && i.inspector_id !== inspectorFilter) return false;
      if (executiveFilter !== 'all' && i.executive_id !== executiveFilter) return false;
      if (bucketFilter !== 'all') {
        const b = priorityBucket(i);
        if (bucketFilter === 'unassigned' && b !== 0) return false;
        if (bucketFilter === 'por_coordinar' && b !== 1) return false;
        if (bucketFilter === 'programadas' && b !== 2) return false;
        if (bucketFilter === 'in_progress' && b !== 3) return false;
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchAddr = (i.address ?? '').toLowerCase().includes(q);
        const matchPropId = i.property_id.toLowerCase().includes(q);
        const matchName = (i.property_name ?? '').toLowerCase().includes(q);
        if (!matchAddr && !matchPropId && !matchName) return false;
      }
      return true;
    });

    const sorted = [...result];
    switch (sortBy) {
      case 'contract_asc':
        sorted.sort((a, b) => nullSafeSort(a.contractEndDate, b.contractEndDate, true));
        break;
      case 'contract_desc':
        sorted.sort((a, b) => nullSafeSort(a.contractEndDate, b.contractEndDate, false));
        break;
      case 'schedule_asc':
        sorted.sort((a, b) => nullSafeSort(a.scheduleDatetime, b.scheduleDatetime, true));
        break;
      case 'schedule_desc':
        sorted.sort((a, b) => nullSafeSort(a.scheduleDatetime, b.scheduleDatetime, false));
        break;
      case 'latest':
        // already updated_at desc from API
        break;
      case 'priority':
      default:
        sorted.sort((a, b) => {
          const pa = priorityBucket(a);
          const pb = priorityBucket(b);
          if (pa !== pb) return pa - pb;
          // Within bucket: por coordinar → contract end asc; programadas → schedule asc; else updated desc
          if (pa === 1) return nullSafeSort(a.contractEndDate, b.contractEndDate, true);
          if (pa === 2) return nullSafeSort(a.scheduleDatetime, b.scheduleDatetime, true);
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        });
        break;
    }
    return sorted;
  }, [inspections, statusFilter, inspectorFilter, executiveFilter, bucketFilter, searchQuery, sortBy]);

  // Workload counts per profile
  const workload = useMemo(() => {
    const inspectorMap = new Map<string, {
      profile: Profile;
      total: number; por_coordinar: number; por_iniciar: number;
      en_progreso: number; programadas: number;
    }>();
    const executiveMap = new Map<string, {
      profile: Profile;
      total: number; pendientes_revision: number; en_revision: number;
      listas_publicar: number; publicadas: number;
    }>();

    for (const p of inspectors) {
      inspectorMap.set(p.id, { profile: p, total: 0, por_coordinar: 0, por_iniciar: 0, en_progreso: 0, programadas: 0 });
    }
    for (const p of executives) {
      executiveMap.set(p.id, { profile: p, total: 0, pendientes_revision: 0, en_revision: 0, listas_publicar: 0, publicadas: 0 });
    }

    for (const insp of inspections) {
      // Inspector workload
      if (insp.inspector_id && inspectorMap.has(insp.inspector_id)) {
        const w = inspectorMap.get(insp.inspector_id)!;
        const isActive = !['published', 'sent', 'approved'].includes(insp.status);
        if (isActive) w.total++;
        if (insp.status === 'assigned' && !insp.scheduleDatetime) w.por_coordinar++;
        if (insp.status === 'assigned' && insp.scheduleDatetime) {
          w.programadas++;
          w.por_iniciar++;
        }
        if (insp.status === 'in_progress') w.en_progreso++;
      }
      // Executive workload
      if (insp.executive_id && executiveMap.has(insp.executive_id)) {
        const w = executiveMap.get(insp.executive_id)!;
        const isActive = !['published', 'sent'].includes(insp.status);
        if (isActive) w.total++;
        if (insp.status === 'submitted') w.pendientes_revision++;
        if (insp.status === 'in_review' || insp.status === 'needs_changes') w.en_revision++;
        if (insp.status === 'approved') w.listas_publicar++;
        if (insp.status === 'published' || insp.status === 'sent') w.publicadas++;
      }
    }

    return {
      inspectors: Array.from(inspectorMap.values()).sort((a, b) => b.total - a.total),
      executives: Array.from(executiveMap.values()).sort((a, b) => b.total - a.total),
    };
  }, [inspections, inspectors, executives]);

  const formatDate = (d: Date) => d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <AdminLayout>
      <div className="p-6 max-w-6xl space-y-6">
        <h1 className="text-h2">Inspecciones</h1>

        <Tabs value={activeTab} onValueChange={(v) => setSearchParams({ tab: v })}>
          <TabsList>
            <TabsTrigger value="all">Todas ({inspections.length})</TabsTrigger>
            <TabsTrigger value="pending">Pendientes ({pendingAssignment.length})</TabsTrigger>
            <TabsTrigger value="workload">Carga de trabajo</TabsTrigger>
            <TabsTrigger value="create">Crear Nueva</TabsTrigger>
          </TabsList>

          {/* All Inspections */}
          <TabsContent value="all" className="space-y-4 mt-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por dirección, ID de propiedad o nombre..."
                className="pl-9"
              />
            </div>

            {/* Quick bucket filter chips */}
            <div className="flex flex-wrap gap-2">
              {BUCKET_FILTERS.map((b) => {
                const active = bucketFilter === b.value;
                const count = b.value === 'all'
                  ? inspections.length
                  : inspections.filter((i) => {
                      const pb = priorityBucket(i);
                      if (b.value === 'unassigned') return pb === 0;
                      if (b.value === 'por_coordinar') return pb === 1;
                      if (b.value === 'programadas') return pb === 2;
                      if (b.value === 'in_progress') return pb === 3;
                      return true;
                    }).length;
                return (
                  <button
                    key={b.value}
                    onClick={() => setBucketFilter(b.value)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 transition-colors',
                      active
                        ? 'bg-primary text-primary-foreground ring-primary'
                        : 'bg-background text-foreground ring-border hover:bg-muted'
                    )}
                  >
                    {b.label}
                    <span className={cn('rounded-full px-1.5 text-[10px]', active ? 'bg-primary-foreground/20' : 'bg-muted')}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Filters + Sort */}
            <div className="flex flex-wrap items-center gap-3">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Estado" /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={inspectorFilter} onValueChange={setInspectorFilter}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Inspector" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los inspectores</SelectItem>
                  {inspectors.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={executiveFilter} onValueChange={setExecutiveFilter}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Ejecutivo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los ejecutivos</SelectItem>
                  {executives.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-[200px]"><SelectValue placeholder="Ordenar por" /></SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-caption text-muted-foreground">{filteredInspections.length} resultados</span>
            </div>

            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
              </div>
            ) : filteredInspections.length === 0 ? (
              <Card className="border-0 ring-1 ring-border shadow-sm">
                <CardContent className="py-12 text-center text-muted-foreground">
                  No hay inspecciones con estos filtros
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {filteredInspections.map((insp) => {
                  const bucket = priorityBucket(insp);
                  const bLabel = bucketLabel(bucket);
                  const missing = missingAssignmentLabel(insp);
                  return (
                    <Card
                      key={insp.id}
                      className={cn(
                        'border-0 shadow-sm hover:shadow-md transition-shadow',
                        bucket === 0
                          ? 'ring-2 ring-status-bad/40'
                          : bucket === 1
                            ? 'ring-1 ring-amber-200 border-dashed'
                            : 'ring-1 ring-border'
                      )}
                    >
                      <CardContent className="py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1.5 flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold', bLabel.className)}>
                                {bLabel.label}
                              </span>
                              {missing && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-status-bad-bg px-2 py-0.5 text-[10px] font-semibold text-status-bad">
                                  <AlertCircle className="h-3 w-3" /> {missing}
                                </span>
                              )}
                              <InspectionStatusBadge status={insp.status} />
                            </div>

                            <p className="font-medium truncate">{insp.property_name ?? insp.property_id}</p>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <MapPin className="h-3 w-3 shrink-0" />
                              <span className="truncate">{insp.address ?? 'Sin dirección'}</span>
                            </div>

                            {/* Date line — schedule if coordinated, else contract end */}
                            {insp.scheduleDatetime ? (
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <CalendarIcon className="h-3 w-3 shrink-0" />
                                <span>
                                  Inspección: {formatDate(insp.scheduleDatetime)}
                                  {insp.scheduleDatetime.getHours() > 0 && ` · ${insp.scheduleDatetime.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}`}
                                </span>
                              </div>
                            ) : insp.contractEndDate ? (
                              <div className="flex items-center gap-1.5 text-xs text-amber-700">
                                <FileText className="h-3 w-3 shrink-0" />
                                <span>Término de contrato: {formatDate(insp.contractEndDate)}</span>
                              </div>
                            ) : null}

                            {/* Assignment + meta line */}
                            <div className="flex items-center gap-x-3 gap-y-1 mt-1 flex-wrap text-tiny text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {insp.inspectorName ?? <span className="italic">sin inspector</span>}
                              </span>
                              <span className="flex items-center gap-1">
                                <UserCog className="h-3 w-3" />
                                {insp.executiveName ?? <span className="italic">sin ejecutivo</span>}
                              </span>
                              <span>{insp.inspection_type} · {insp.market}</span>
                            </div>
                          </div>
                          <Link to={`/admin/inspections/${insp.id}`}>
                            <Button variant="outline" size="sm" className="gap-1.5 shrink-0">
                              <ExternalLink className="h-3.5 w-3.5" /> Ver / Editar
                            </Button>
                          </Link>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Pending Assignment */}
          <TabsContent value="pending" className="space-y-4 mt-4">
            {pendingAssignment.length === 0 ? (
              <Card className="border-0 ring-1 ring-border shadow-sm">
                <CardContent className="py-12 text-center text-muted-foreground">
                  Todas las inspecciones están asignadas
                </CardContent>
              </Card>
            ) : (
              pendingAssignment.map((insp) => {
                const missing = missingAssignmentLabel(insp);
                return (
                  <Card key={insp.id} className="border-0 ring-1 ring-status-bad/30 shadow-sm">
                    <CardContent className="py-4 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {missing && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-status-bad-bg px-2 py-0.5 text-[10px] font-semibold text-status-bad">
                                <AlertCircle className="h-3 w-3" /> {missing}
                              </span>
                            )}
                            <InspectionStatusBadge status={insp.status} />
                          </div>
                          <p className="font-medium truncate">{insp.property_name ?? insp.property_id}</p>
                          <p className="text-caption text-muted-foreground truncate">{insp.address}</p>
                          <p className="text-tiny text-muted-foreground">
                            Inspector: {insp.inspectorName ?? '—'} · Ejecutivo: {insp.executiveName ?? '—'}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setAssigningId(assigningId === insp.id ? null : insp.id);
                            setAssignInspector(insp.inspector_id ?? '');
                            setAssignExecutive(insp.executive_id ?? '');
                          }}
                        >
                          <UserCheck className="mr-1 h-3.5 w-3.5" /> Asignar
                        </Button>
                      </div>
                      {assigningId === insp.id && (
                        <div className="pt-3 border-t space-y-3">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <label className="text-caption font-medium text-muted-foreground">Inspector</label>
                              <Select value={assignInspector} onValueChange={setAssignInspector}>
                                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                                <SelectContent>
                                  {inspectors.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <label className="text-caption font-medium text-muted-foreground">Ejecutivo</label>
                              <Select value={assignExecutive} onValueChange={setAssignExecutive}>
                                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                                <SelectContent>
                                  {executives.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <Button onClick={() => handleAssign(insp.id)} size="sm">Confirmar Asignación</Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>

          {/* Workload */}
          <TabsContent value="workload" className="space-y-6 mt-4">
            <Card className="border-0 ring-1 ring-border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-primary" /> Inspectores
                </CardTitle>
                <CardDescription>Carga operativa activa por inspector. Ordenado de mayor a menor.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {workload.inspectors.length === 0 ? (
                  <div className="px-6 py-8 text-center text-sm text-muted-foreground">No hay inspectores activos.</div>
                ) : (
                  <div className="divide-y">
                    {workload.inspectors.map((w) => (
                      <div key={w.profile.id} className="px-4 py-3 flex items-center gap-4 flex-wrap">
                        <div className="min-w-[180px] flex-1">
                          <p className="text-sm font-medium truncate">{w.profile.full_name}</p>
                          <p className="text-tiny text-muted-foreground truncate">
                            {w.profile.email}{w.profile.market ? ` · ${w.profile.market}` : ''}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                          <Stat label="Activas" value={w.total} emphasis />
                          <Stat label="Por coordinar" value={w.por_coordinar} />
                          <Stat label="Por iniciar" value={w.por_iniciar} />
                          <Stat label="En progreso" value={w.en_progreso} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-0 ring-1 ring-border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" /> Ejecutivos
                </CardTitle>
                <CardDescription>Carga operativa activa por ejecutivo. Ordenado de mayor a menor.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {workload.executives.length === 0 ? (
                  <div className="px-6 py-8 text-center text-sm text-muted-foreground">No hay ejecutivos activos.</div>
                ) : (
                  <div className="divide-y">
                    {workload.executives.map((w) => (
                      <div key={w.profile.id} className="px-4 py-3 flex items-center gap-4 flex-wrap">
                        <div className="min-w-[180px] flex-1">
                          <p className="text-sm font-medium truncate">{w.profile.full_name}</p>
                          <p className="text-tiny text-muted-foreground truncate">
                            {w.profile.email}{w.profile.market ? ` · ${w.profile.market}` : ''}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                          <Stat label="Activas" value={w.total} emphasis />
                          <Stat label="Pend. revisión" value={w.pendientes_revision} />
                          <Stat label="En revisión" value={w.en_revision} />
                          <Stat label="Listas publicar" value={w.listas_publicar} />
                          <Stat label="Publicadas" value={w.publicadas} muted />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Manual Creation */}
          <TabsContent value="create" className="space-y-6 mt-4">
            <Card className="border-0 ring-1 ring-border shadow-sm">
              <CardHeader>
                <CardTitle className="text-body-lg">Paso 1 — Payload de Propiedad</CardTitle>
                <CardDescription>Selecciona un ejemplo o pega un JSON personalizado</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Select value={selectedExample} onValueChange={handleExampleChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {payloadOptions.map((opt) => <SelectItem key={opt.key} value={opt.key}>{opt.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Textarea
                  value={payloadText}
                  onChange={(e) => setPayloadText(e.target.value)}
                  className="font-mono text-xs min-h-[300px]"
                />
              </CardContent>
            </Card>

            <Card className="border-0 ring-1 ring-border shadow-sm">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <UserCheck className="h-5 w-5 text-primary" />
                  <CardTitle className="text-body-lg">Paso 2 — Asignación</CardTitle>
                </div>
                <CardDescription>Selecciona inspector y ejecutivo</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Inspector</Label>
                  {inspectors.length === 0 ? (
                    <div className="flex items-center gap-2 text-sm text-status-regular">
                      <AlertCircle className="h-4 w-4" /> No hay inspectores registrados
                    </div>
                  ) : (
                    <Select value={selectedInspectorId} onValueChange={setSelectedInspectorId}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar inspector..." /></SelectTrigger>
                      <SelectContent>
                        {inspectors.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name} ({p.email})</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Ejecutivo</Label>
                  {executives.length === 0 ? (
                    <div className="flex items-center gap-2 text-sm text-status-regular">
                      <AlertCircle className="h-4 w-4" /> No hay ejecutivos registrados
                    </div>
                  ) : (
                    <Select value={selectedExecutiveId} onValueChange={setSelectedExecutiveId}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar ejecutivo..." /></SelectTrigger>
                      <SelectContent>
                        {executives.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name} ({p.email})</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </CardContent>
            </Card>

            <Button
              onClick={handleGenerate}
              disabled={generating || !selectedInspectorId || !selectedExecutiveId}
              className="w-full h-12 text-body-lg"
              size="lg"
            >
              <Zap className="mr-2 h-5 w-5" />
              {generating ? 'Generando...' : 'Generar Inspección'}
            </Button>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}

function Stat({ label, value, emphasis, muted }: { label: string; value: number; emphasis?: boolean; muted?: boolean }) {
  return (
    <div className="flex flex-col items-start min-w-[80px]">
      <span className={cn(
        'text-base font-semibold tabular-nums',
        emphasis && value > 0 && 'text-primary',
        muted && 'text-muted-foreground'
      )}>{value}</span>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
    </div>
  );
}
