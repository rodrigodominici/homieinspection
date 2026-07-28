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
import { buildInspectionHaystack, matchesInspectionQuery } from '@/lib/inspection-search';
import { INSPECTION_LIST_COLUMNS } from '@/lib/inspection-columns';
import {
  priorityBucket as sharedPriorityBucket,
  priorityBucketLabel,
  missingAssignmentLabel,
} from '@/lib/inspector-operational';
import { marketLabel } from '@/lib/markets';
import { getContractDateShortLabel } from '@/lib/inspection-type-labels';
import AdminLayout from '@/components/AdminLayout';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { FiltersBar, KpiCard } from '@/shared/ui';
import type { Inspection, Profile } from '@/lib/types';
import {
  UserCheck, AlertCircle, Zap, Search, ExternalLink, MapPin, User, UserCog,
  Calendar as CalendarIcon, FileText, LayoutGrid, Table2,
  ArrowUpDown, Check, FileSearch, Send, CheckCircle2, Clock, Building2,
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
  { value: 'approved', label: 'Aprobada' },
  { value: 'published', label: 'Publicada' },
  { value: 'accepted', label: 'Aceptada por propietario' },
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

const PAGE_SIZE_OPTIONS = [25, 50, 100];

// Quick-filter buckets — SINGLE axis for KPI cards + chip row.
// Every value here maps to exactly one predicate below, and clicking any
// KPI/chip resets `statusFilter` so counters and results always agree.
type Bucket =
  | 'all'
  | 'unassigned'
  | 'por_coordinar'
  | 'programadas'
  | 'in_progress'
  | 'for_review'
  | 'to_publish'
  | 'waiting_owner'
  | 'owner_feedback'
  | 'accepted';
const BUCKET_FILTERS: { value: Bucket; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'unassigned', label: 'Sin asignar' },
  { value: 'por_coordinar', label: 'Por coordinar' },
  { value: 'programadas', label: 'Programadas' },
  { value: 'in_progress', label: 'En progreso' },
  { value: 'for_review', label: 'Para revisar' },
  { value: 'to_publish', label: 'Para publicar' },
  { value: 'waiting_owner', label: 'Esperando propietario' },
  { value: 'owner_feedback', label: 'Feedback propietario' },
  { value: 'accepted', label: 'Aceptadas' },
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
function priorityBucket(insp: EnrichedInspection): 0 | 1 | 2 | 3 | 4 | 5 {
  return sharedPriorityBucket({
    inspector_id: insp.inspector_id,
    executive_id: insp.executive_id,
    status: insp.status,
    owner_feedback_status: insp.owner_feedback_status ?? null,
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
  const [marketFilter, setMarketFilter] = useState<string>(searchParams.get('market') ?? 'all');
  const [publishedFilter, setPublishedFilter] = useState<string>(searchParams.get('published') ?? 'all');
  const [bucketFilter, setBucketFilter] = useState<Bucket>((searchParams.get('bucket') as Bucket) ?? 'all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState(searchParams.get('sort') ?? 'priority');
  const [page, setPage] = useState<number>(() => {
    const p = parseInt(searchParams.get('page') ?? '1', 10);
    return Number.isFinite(p) && p > 0 ? p : 1;
  });
  const [pageSize, setPageSize] = useState<number>(() => {
    const ps = parseInt(searchParams.get('pageSize') ?? '25', 10);
    return PAGE_SIZE_OPTIONS.includes(ps) ? ps : 25;
  });

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
    setOrDelete('market', marketFilter);
    setOrDelete('published', publishedFilter);
    setOrDelete('bucket', bucketFilter);
    setOrDelete('sort', sortBy, 'priority');
    if (page > 1) next.set('page', String(page)); else next.delete('page');
    if (pageSize !== 25) next.set('pageSize', String(pageSize)); else next.delete('pageSize');
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspectorFilter, executiveFilter, statusFilter, marketFilter, publishedFilter, bucketFilter, sortBy, page, pageSize]);

  // Reset to first page whenever filters / search / sort change.
  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, inspectorFilter, executiveFilter, marketFilter, publishedFilter, bucketFilter, searchQuery, sortBy]);

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
          .select(`${INSPECTION_LIST_COLUMNS}, inspector:profiles!inspections_inspector_id_fkey(full_name), executive:profiles!inspections_executive_id_fkey(full_name)`)
          .order('updated_at', { ascending: false })
          .limit(500),
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

  // Pre-compute priority bucket once per inspection (used by filters, sort, chips, KPIs).
  const bucketByInsp = useMemo(() => {
    const m = new Map<string, 0 | 1 | 2 | 3 | 4 | 5>();
    for (const i of inspections) m.set(i.id, priorityBucket(i));
    return m;
  }, [inspections]);

  // Bucket counts in one pass (avoids 5x .filter inside the JSX).
  const bucketCounts = useMemo(() => {
    const counts = {
      all: inspections.length,
      unassigned: 0,
      por_coordinar: 0,
      programadas: 0,
      in_progress: 0,
      owner_feedback: 0,
      waiting_owner: 0,
      accepted: 0,
    };
    for (const i of inspections) {
      const b = bucketByInsp.get(i.id);
      if (b === 0) counts.unassigned++;
      else if (b === 1) counts.por_coordinar++;
      else if (b === 2) counts.programadas++;
      else if (b === 3) counts.in_progress++;
      else if (b === 4) counts.owner_feedback++;
      const fb = i.owner_feedback_status ?? 'none';
      if ((i.status === 'published' || i.status === 'sent') && fb === 'none') counts.waiting_owner++;
      if (fb === 'accepted') counts.accepted++;
    }
    return counts;
  }, [inspections, bucketByInsp]);

  // KPIs aligned with executive view + admin-only signals.
  // After publish, the lifecycle splits in 3 (waiting / feedback / accepted)
  // to reflect the owner-feedback loop instead of a single "Publicadas" bucket.
  const kpis = useMemo(() => ({
    unassigned:    bucketCounts.unassigned,
    inProgress:    inspections.filter((i) => i.status === 'in_progress').length,
    forReview:     inspections.filter((i) => i.status === 'submitted' || i.status === 'in_review').length,
    toPublish:     inspections.filter((i) => i.status === 'approved' && i.owner_feedback_status !== 'accepted').length,
    waitingOwner:  bucketCounts.waiting_owner,
    ownerFeedback: bucketCounts.owner_feedback,
    accepted:      bucketCounts.accepted,
  }), [inspections, bucketCounts]);

  // Available markets (for the market dropdown).
  const markets = useMemo(
    () => [...new Set(inspections.map((i) => i.market).filter(Boolean) as string[])],
    [inspections]
  );

  // Precompute normalized haystacks per inspection so tokenized search across
  // address, tenant, inspector name, executive name, etc. is O(n) per keystroke.
  const haystackByInsp = useMemo(() => {
    const inspectorById = new Map(inspectors.map((p) => [p.id, p]));
    const executiveById = new Map(executives.map((p) => [p.id, p]));
    const map = new Map<string, string>();
    for (const i of inspections) {
      const insName = i.inspector_id
        ? inspectorById.get(i.inspector_id)?.full_name ?? inspectorById.get(i.inspector_id)?.email ?? null
        : null;
      const exName = i.executive_id
        ? executiveById.get(i.executive_id)?.full_name ?? executiveById.get(i.executive_id)?.email ?? null
        : null;
      map.set(i.id, buildInspectionHaystack(i, { inspectorName: insName, executiveName: exName }));
    }
    return map;
  }, [inspections, inspectors, executives]);

  // Apply all filters + sorting
  const filteredInspections = useMemo(() => {
    const result = inspections.filter((i) => {
      if (statusFilter !== 'all' && i.status !== statusFilter) return false;
      if (inspectorFilter !== 'all' && i.inspector_id !== inspectorFilter) return false;
      if (executiveFilter !== 'all' && i.executive_id !== executiveFilter) return false;
      if (marketFilter !== 'all' && i.market !== marketFilter) return false;
      if (publishedFilter === 'published' && !i.published_at) return false;
      if (publishedFilter === 'not_published' && !!i.published_at) return false;
      if (bucketFilter !== 'all') {
        const b = bucketByInsp.get(i.id);
        const fb = i.owner_feedback_status ?? 'none';
        if (bucketFilter === 'unassigned' && b !== 0) return false;
        if (bucketFilter === 'por_coordinar' && b !== 1) return false;
        if (bucketFilter === 'programadas' && b !== 2) return false;
        if (bucketFilter === 'in_progress' && b !== 3) return false;
        if (bucketFilter === 'owner_feedback' && b !== 4) return false;
        if (bucketFilter === 'waiting_owner'
          && !((i.status === 'published' || i.status === 'sent') && fb === 'none')) return false;
        if (bucketFilter === 'accepted' && fb !== 'accepted') return false;
      }
      if (!matchesInspectionQuery(haystackByInsp.get(i.id) ?? '', searchQuery)) return false;
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
          const pa = bucketByInsp.get(a.id) ?? 5;
          const pb = bucketByInsp.get(b.id) ?? 5;
          if (pa !== pb) return pa - pb;
          if (pa === 1) return nullSafeSort(a.contractEndDate, b.contractEndDate, true);
          if (pa === 2) return nullSafeSort(a.scheduleDatetime, b.scheduleDatetime, true);
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        });
        break;
    }
    return sorted;
  }, [inspections, haystackByInsp, bucketByInsp, statusFilter, inspectorFilter, executiveFilter, marketFilter, publishedFilter, bucketFilter, searchQuery, sortBy]);

  // Client-side pagination over filtered results.
  const totalResults = filteredInspections.length;
  const pageCount = Math.max(1, Math.ceil(totalResults / pageSize));
  const safePage = Math.min(page, pageCount);
  const paginatedInspections = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredInspections.slice(start, start + pageSize);
  }, [filteredInspections, safePage, pageSize]);
  const firstShown = totalResults === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const lastShown = Math.min(totalResults, safePage * pageSize);


  // Workload moved to AdminDashboard (single source of truth for assignment decisions).


  const formatDate = (d: Date) => d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <AdminLayout>
      <div className="p-6 max-w-7xl space-y-6">
        <h1 className="text-h2">Inspecciones</h1>

        <Tabs value={activeTab} onValueChange={(v) => setSearchParams({ tab: v })}>
          <TabsList>
            <TabsTrigger value="all">Todas ({inspections.length})</TabsTrigger>
            <TabsTrigger value="pending">Pendientes ({pendingAssignment.length})</TabsTrigger>
            <TabsTrigger value="create">Crear Nueva</TabsTrigger>
          </TabsList>

          {/* All Inspections */}
          <TabsContent value="all" className="space-y-4 mt-4">
            {/* KPIs — clickable filter shortcuts. Post-publish lifecycle
                splits in 3 (esperando ↔ feedback ↔ aceptadas). */}
            <div className="grid grid-cols-2 lg:grid-cols-7 gap-3">
              <KpiCard
                label="Sin asignar" value={kpis.unassigned}
                icon={<UserCheck className="h-5 w-5 text-status-bad" />} accent="red"
                tooltip="Inspecciones creadas que aún no tienen inspector asignado."
                active={bucketFilter === 'unassigned'}
                onClick={() => setBucketFilter(bucketFilter === 'unassigned' ? 'all' : 'unassigned')}
              />
              <KpiCard
                label="En progreso" value={kpis.inProgress}
                icon={<Clock className="h-5 w-5 text-primary" />} accent="blue"
                tooltip="El inspector ya inició la captura en sitio."
                active={statusFilter === 'in_progress'}
                onClick={() => setStatusFilter(statusFilter === 'in_progress' ? 'all' : 'in_progress')}
              />
              <KpiCard
                label="Para revisar" value={kpis.forReview}
                icon={<FileSearch className="h-5 w-5 text-primary" />} accent="blue"
                tooltip="Enviadas por el inspector y esperando revisión del ejecutivo."
                active={statusFilter === 'submitted'}
                onClick={() => setStatusFilter(statusFilter === 'submitted' ? 'all' : 'submitted')}
              />
              <KpiCard
                label="Para publicar" value={kpis.toPublish}
                icon={<Send className="h-5 w-5 text-primary" />} accent="blue"
                tooltip="Aprobadas internamente. Falta enviarlas al propietario."
                active={statusFilter === 'approved'}
                onClick={() => setStatusFilter(statusFilter === 'approved' ? 'all' : 'approved')}
              />
              <KpiCard
                label="Esperando propietario" value={kpis.waitingOwner}
                icon={<Clock className="h-5 w-5 text-primary" />} accent="blue"
                tooltip="Publicadas y enviadas al propietario. Aguardando su respuesta."
                active={bucketFilter === 'waiting_owner'}
                onClick={() => setBucketFilter(bucketFilter === 'waiting_owner' ? 'all' : 'waiting_owner')}
              />
              <KpiCard
                label="Feedback propietario" value={kpis.ownerFeedback}
                icon={<AlertCircle className="h-5 w-5 text-status-bad" />} accent="red"
                tooltip="El propietario solicitó cambios. Requiere acción del ejecutivo."
                active={bucketFilter === 'owner_feedback'}
                onClick={() => setBucketFilter(bucketFilter === 'owner_feedback' ? 'all' : 'owner_feedback')}
              />
              <KpiCard
                label="Aceptadas" value={kpis.accepted}
                icon={<CheckCircle2 className="h-5 w-5 text-accent" />} accent="green"
                tooltip="El propietario aceptó la cotización. Ciclo cerrado."
                active={bucketFilter === 'accepted'}
                onClick={() => setBucketFilter(bucketFilter === 'accepted' ? 'all' : 'accepted')}
              />
            </div>

            {/* FiltersBar — search + selects + sort + view toggle */}
            <FiltersBar>
              <div className="relative flex-1 min-w-[220px] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Dirección, unidad, inspector, propietario…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9 rounded-lg bg-card"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px] h-9 text-caption rounded-lg bg-card"><SelectValue placeholder="Estado" /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {markets.length > 1 && (
                <Select value={marketFilter} onValueChange={setMarketFilter}>
                  <SelectTrigger className="w-[150px] h-9 text-caption rounded-lg bg-card">
                    <Building2 className="h-3.5 w-3.5 mr-1.5" />
                    <SelectValue placeholder="Mercado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los mercados</SelectItem>
                    {markets.map((m) => <SelectItem key={m} value={m}>{marketLabel(m)}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              <Select value={inspectorFilter} onValueChange={setInspectorFilter}>
                <SelectTrigger className="w-[170px] h-9 text-caption rounded-lg bg-card"><SelectValue placeholder="Inspector" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los inspectores</SelectItem>
                  {inspectors.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={executiveFilter} onValueChange={setExecutiveFilter}>
                <SelectTrigger className="w-[170px] h-9 text-caption rounded-lg bg-card"><SelectValue placeholder="Ejecutivo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los ejecutivos</SelectItem>
                  {executives.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={publishedFilter} onValueChange={setPublishedFilter}>
                <SelectTrigger className="w-[160px] h-9 text-caption rounded-lg bg-card"><SelectValue placeholder="Publicación" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="published">Solo publicadas</SelectItem>
                  <SelectItem value="not_published">Sin publicar</SelectItem>
                </SelectContent>
              </Select>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 gap-1.5 text-caption rounded-lg bg-card">
                    <ArrowUpDown className="h-3.5 w-3.5" />
                    Ordenar
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  {SORT_OPTIONS.map((o) => (
                    <DropdownMenuItem key={o.value} onClick={() => setSortBy(o.value)} className="gap-2">
                      {sortBy === o.value
                        ? <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                        : <span className="h-3.5 w-3.5 shrink-0" />}
                      {o.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
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
            </FiltersBar>

            {/* Sub-filter: priority buckets (operational lens) */}
            <div className="flex flex-wrap items-center gap-2">
              {BUCKET_FILTERS.map((b) => {
                const active = bucketFilter === b.value;
                const count = bucketCounts[b.value];
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
              <span className="ml-auto text-tiny text-muted-foreground">
                {totalResults} resultado{totalResults === 1 ? '' : 's'}
              </span>
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
                      {paginatedInspections.map((insp) => {
                        const bucket = bucketByInsp.get(insp.id) ?? 5;
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
                {paginatedInspections.map((insp) => {
                  const bucket = bucketByInsp.get(insp.id) ?? 5;
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
                                <span>{getContractDateShortLabel(insp.inspection_type)}: {formatDate(insp.contractEndDate)}</span>
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

            {/* Pagination footer */}
            {totalResults > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="text-tiny text-muted-foreground">
                  Mostrando {firstShown}–{lastShown} de {totalResults}
                  {inspections.length >= 500 && (
                    <span className="ml-2 text-amber-700">
                      · Mostrando las 500 más recientes
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Select value={String(pageSize)} onValueChange={(v) => setPageSize(parseInt(v, 10))}>
                    <SelectTrigger className="w-[110px] h-9 text-caption rounded-lg bg-card">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAGE_SIZE_OPTIONS.map((n) => (
                        <SelectItem key={n} value={String(n)}>{n} / página</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline" size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={safePage <= 1}
                  >
                    Anterior
                  </Button>
                  <span className="text-caption text-muted-foreground px-2">
                    Página {safePage} de {pageCount}
                  </span>
                  <Button
                    variant="outline" size="sm"
                    onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                    disabled={safePage >= pageCount}
                  >
                    Siguiente
                  </Button>
                </div>
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

