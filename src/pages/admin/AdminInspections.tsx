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
import {
  priorityBucket as sharedPriorityBucket,
  priorityBucketLabel,
  missingAssignmentLabel,
} from '@/lib/inspector-operational';
import { marketLabel } from '@/lib/markets';
import AdminLayout from '@/components/AdminLayout';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { Inspection, Profile } from '@/lib/types';
import {
  UserCheck, AlertCircle, Zap, Search, ExternalLink, MapPin, User, UserCog,
  Calendar as CalendarIcon, FileText, ChevronDown, SlidersHorizontal,
  LayoutGrid, Table2,
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
  { value: 'pending', label: 'Pendiente' },
  { value: 'pending_assignment', label: 'Sin asignar' },
  { value: 'assigned', label: 'Asignada' },
  { value: 'in_progress', label: 'En progreso' },
  { value: 'submitted', label: 'Lista para revisión' },
  { value: 'in_review', label: 'En revisión' },
  { value: 'needs_changes', label: 'Requiere cambios' },
  { value: 'approved', label: 'Aprobada' },
  { value: 'published', label: 'Publicada' },
  { value: 'sent', label: 'Entregada' },
];

const SORT_OPTIONS = [
  { value: 'priority', label: 'Más urgente primero (recomendado)' },
  { value: 'latest', label: 'Última actividad' },
  { value: 'created_desc', label: 'Más recientes primero' },
  { value: 'created_asc', label: 'Más antiguos primero' },
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
 * Local helper: bucket lookup adapted for EnrichedInspection (which already has scheduleDatetime).
 * Delegates to the shared `priorityBucket` so AdminInspections and AdminDashboard never drift.
 */
function priorityBucket(insp: EnrichedInspection): 0 | 1 | 2 | 3 | 5 {
  return sharedPriorityBucket({
    inspector_id: insp.inspector_id,
    executive_id: insp.executive_id,
    status: insp.status,
    scheduleDatetime: insp.scheduleDatetime,
  });
}

/**
 * BADGE PRECEDENCE ON ADMIN CARDS (single source of truth):
 *
 *   1. Primary  — derived from priorityBucket via priorityBucketLabel().
 *                 Always exactly 1 badge: "Sin asignar" | "Por coordinar"
 *                 | "Programada" | "En progreso" | "Completada".
 *
 *   2. Secondary — only when bucket === 0, derived from missingAssignmentLabel():
 *                  "Faltan ambos" | "Falta inspector" | "Falta ejecutivo".
 *
 *   The raw `<InspectionStatusBadge status={...}>` is intentionally NOT rendered
 *   on the list cards: it duplicates "Sin Asignar" with the bucket primary
 *   and adds enum noise. Raw status remains visible in AdminInspectionDetail.
 */

export default function AdminInspections() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') ?? 'all';

  const [inspections, setInspections] = useState<EnrichedInspection[]>([]);
  const [inspectors, setInspectors] = useState<Profile[]>([]);
  const [executives, setExecutives] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>(searchParams.get('status') ?? 'all');
  const [inspectorFilter, setInspectorFilter] = useState<string>(searchParams.get('inspector') ?? 'all');
  const [executiveFilter, setExecutiveFilter] = useState<string>(searchParams.get('executive') ?? 'all');
  const [bucketFilter, setBucketFilter] = useState<Bucket>((searchParams.get('bucket') as Bucket) ?? 'all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('priority');

  // Keep URL in sync with filter selections so the state is shareable.
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    const setOrDelete = (key: string, value: string, defaultValue = 'all') => {
      if (value && value !== defaultValue) next.set(key, value);
      else next.delete(key);
    };
    setOrDelete('inspector', inspectorFilter);
    setOrDelete('executive', executiveFilter);
    setOrDelete('status', statusFilter);
    setOrDelete('bucket', bucketFilter);
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspectorFilter, executiveFilter, statusFilter, bucketFilter]);
  const viewMode: 'cards' | 'table' = (searchParams.get('view') === 'table' ? 'table' : 'cards');
  const setViewMode = (v: 'cards' | 'table') => {
    const next = new URLSearchParams(searchParams);
    if (v === 'cards') next.delete('view'); else next.set('view', 'table');
    setSearchParams(next);
  };

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
      case 'created_desc':
        sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
      case 'created_asc':
        sorted.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
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

  // Workload moved to AdminDashboard (single source of truth for assignment decisions).


  const formatDate = (d: Date) => d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <AdminLayout>
      <div className="p-6 max-w-6xl space-y-6">
        <h1 className="text-h2">Inspecciones</h1>

        <Tabs value={activeTab} onValueChange={(v) => setSearchParams({ tab: v })}>
          <TabsList>
            <TabsTrigger value="all">Todas ({inspections.length})</TabsTrigger>
            <TabsTrigger value="pending">Pendientes ({pendingAssignment.length})</TabsTrigger>
            <TabsTrigger value="create">Crear Nueva</TabsTrigger>
          </TabsList>

          {/* All Inspections */}
          <TabsContent value="all" className="space-y-4 mt-4">
            {/* Controls — search + bucket chips + advanced filters */}
            <Card className="border-0 ring-1 ring-border shadow-sm">
              <CardContent className="p-4 space-y-3">
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

                {/* Quick bucket filter chips (operational priority) */}
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
                  <div className="ml-auto">
                    <ToggleGroup
                      type="single"
                      value={viewMode}
                      onValueChange={(v) => v && setViewMode(v as 'cards' | 'table')}
                      size="sm"
                      variant="outline"
                    >
                      <ToggleGroupItem value="cards" aria-label="Vista de tarjetas" title="Tarjetas">
                        <LayoutGrid className="h-4 w-4" />
                      </ToggleGroupItem>
                      <ToggleGroupItem value="table" aria-label="Vista de tabla" title="Tabla">
                        <Table2 className="h-4 w-4" />
                      </ToggleGroupItem>
                    </ToggleGroup>
                  </div>
                </div>

                <Separator />

                {/* Advanced filters — lifecycle state + people + sort */}
                <Collapsible defaultOpen={false}>
                  <CollapsibleTrigger className="flex items-center justify-between w-full text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                    <span className="inline-flex items-center gap-1.5">
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                      Filtros avanzados
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <span>{filteredInspections.length} resultados</span>
                      <ChevronDown className="h-3.5 w-3.5" />
                    </span>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger><SelectValue placeholder="Estado del workflow" /></SelectTrigger>
                        <SelectContent position="popper" sideOffset={4}>
                          {STATUS_OPTIONS.map(o => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={inspectorFilter} onValueChange={setInspectorFilter}>
                        <SelectTrigger><SelectValue placeholder="Inspector" /></SelectTrigger>
                        <SelectContent position="popper" sideOffset={4}>
                          <SelectItem value="all">Todos los inspectores</SelectItem>
                          {inspectors.map(p => (
                            <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={executiveFilter} onValueChange={setExecutiveFilter}>
                        <SelectTrigger><SelectValue placeholder="Ejecutivo" /></SelectTrigger>
                        <SelectContent position="popper" sideOffset={4}>
                          <SelectItem value="all">Todos los ejecutivos</SelectItem>
                          {executives.map(p => (
                            <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={sortBy} onValueChange={setSortBy}>
                        <SelectTrigger><SelectValue placeholder="Ordenar por" /></SelectTrigger>
                        <SelectContent position="popper" sideOffset={4}>
                          {SORT_OPTIONS.map(o => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </CardContent>
            </Card>


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
            ) : viewMode === 'table' ? (
              <Card className="border-0 ring-1 ring-border shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Propiedad</TableHead>
                        <TableHead>ID</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Asignación</TableHead>
                        <TableHead>Inspector</TableHead>
                        <TableHead>Ejecutivo</TableHead>
                        <TableHead>Mercado</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Creada</TableHead>
                        <TableHead>Término contrato</TableHead>
                        <TableHead>Recolección llaves</TableHead>
                        <TableHead className="text-right">Acción</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredInspections.map((insp) => {
                        const bucket = priorityBucket(insp);
                        const bLabel = priorityBucketLabel(bucket);
                        const missing = missingAssignmentLabel(insp);
                        return (
                          <TableRow key={insp.id} className="cursor-pointer [&>td]:py-3">
                            <TableCell className="max-w-[220px]">
                              <div className="font-medium truncate">{insp.property_name ?? insp.property_id}</div>
                              {insp.address && (
                                <div className="text-tiny text-muted-foreground truncate">{insp.address}</div>
                              )}
                            </TableCell>
                            <TableCell className="text-tiny text-muted-foreground">{insp.property_id}</TableCell>
                            <TableCell>
                              <span className={cn('inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[10px] font-semibold leading-5', bLabel.className)}>
                                {bLabel.label}
                              </span>
                            </TableCell>
                            <TableCell>
                              {missing ? (
                                <span className="inline-flex items-center gap-1 whitespace-nowrap text-tiny font-medium text-status-bad">
                                  <AlertCircle className="h-3 w-3 shrink-0" /> {missing}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 whitespace-nowrap text-tiny text-muted-foreground">
                                  <span className="text-status-good">✓</span> Completa
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs">{insp.inspectorName ?? <span className="italic text-muted-foreground">—</span>}</TableCell>
                            <TableCell className="text-xs">{insp.executiveName ?? <span className="italic text-muted-foreground">—</span>}</TableCell>
                            <TableCell className="text-xs">{marketLabel(insp.market)}</TableCell>
                            <TableCell className="text-xs">{insp.inspection_type}</TableCell>
                            <TableCell className="text-xs whitespace-nowrap">{formatDate(new Date(insp.created_at))}</TableCell>
                            <TableCell className="text-xs whitespace-nowrap">
                              {insp.contractEndDate ? formatDate(insp.contractEndDate) : <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell className="text-xs whitespace-nowrap">
                              {insp.scheduleDatetime ? formatDate(insp.scheduleDatetime) : <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell className="text-right">
                              <Link to={`/admin/inspections/${insp.id}`}>
                                <Button variant="outline" size="sm" className="gap-1.5">
                                  <ExternalLink className="h-3.5 w-3.5" /> Ver
                                </Button>
                              </Link>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            ) : (
              <div className="space-y-3">
                {filteredInspections.map((insp) => {
                  const bucket = priorityBucket(insp);
                  const bLabel = priorityBucketLabel(bucket);
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
                            </div>

                            <p className="font-medium truncate">{insp.property_name ?? insp.property_id}</p>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <MapPin className="h-3 w-3 shrink-0" />
                              <span className="truncate">{insp.address ?? 'Sin dirección'}</span>
                            </div>

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

                            <div className="flex items-center gap-x-3 gap-y-1 mt-1 flex-wrap text-tiny text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {insp.inspectorName ?? <span className="italic">sin inspector</span>}
                              </span>
                              <span className="flex items-center gap-1">
                                <UserCog className="h-3 w-3" />
                                {insp.executiveName ?? <span className="italic">sin ejecutivo</span>}
                              </span>
                              <span>{insp.inspection_type} · {marketLabel(insp.market)}</span>
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

          {/* Workload moved to AdminDashboard */}

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

