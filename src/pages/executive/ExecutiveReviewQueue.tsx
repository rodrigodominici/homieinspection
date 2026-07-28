import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { calculateProgress, getEffectiveSnapshot } from '@/lib/inspection-utils';
import ExecutiveLayout from '@/components/ExecutiveLayout';
import type { Inspection, InspectionSection } from '@/lib/types';
import type { SectionMeta } from '@/modules/inspection/api/inspections.service';
import {
  FileSearch, Clock, Search, Eye, Send, ExternalLink, Play, CheckCircle2,
  ArrowUpDown, Key, Check, ChevronRight, AlertCircle,
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';

import {
  PageHeader,
  FiltersBar,
  KpiCard,
  StatusBadge,
  EmptyState,
  LoadingState,
  ErrorState,
} from '@/shared/ui';
import { useExecutiveQueue } from '@/modules/review/api';
import { isAcceptedByOwner } from '@/lib/inspection-combined-status';
import { buildInspectionHaystack, matchesInspectionQuery } from '@/lib/inspection-search';


// ─── Bucketing (job-to-be-done) ────────────────────
type ExecutiveBucket =
  | 'owner_feedback'  // published + owner pidió cambios → máxima prioridad
  | 'action'          // submitted, in_review, approved
  | 'follow_up'       // published, sent (sin feedback) y aceptadas
  | 'pre_inspection'; // pending_assignment, assigned, in_progress

function getExecutiveBucket(insp: Inspection): ExecutiveBucket {
  if ((insp.status === 'published' || insp.status === 'sent')
      && insp.owner_feedback_status === 'pending_executive_review') {
    return 'owner_feedback';
  }
  // Aceptada por propietario = ciclo cerrado, no es acción pendiente.
  if (isAcceptedByOwner(insp)) return 'follow_up';
  if (['submitted', 'in_review', 'approved'].includes(insp.status)) return 'action';
  if (['published', 'sent'].includes(insp.status)) return 'follow_up';
  return 'pre_inspection';
}

const ACTIONABLE_BUCKETS: ExecutiveBucket[] = ['action', 'owner_feedback'];

type SortKey = 'updated' | 'keys-asc' | 'keys-desc';
const SORT_LABELS: Record<SortKey, string> = {
  'updated': 'Última actividad',
  'keys-asc': 'Recolección: próxima primero',
  'keys-desc': 'Recolección: más lejana primero',
};

type CTAInfo = { label: string; icon: React.ReactNode; variant: 'default' | 'outline' | 'secondary' };

function getContextualCTA(insp: Inspection, bucket: ExecutiveBucket): CTAInfo {
  // Pre-inspección: informativo únicamente, el ejecutivo no asigna inspectores
  if (bucket === 'pre_inspection') {
    return { label: 'Ver detalle', icon: <Eye className="mr-1 h-3.5 w-3.5" />, variant: 'outline' };
  }
  if (bucket === 'owner_feedback') {
    return { label: 'Revisar feedback', icon: <FileSearch className="mr-1 h-3.5 w-3.5" />, variant: 'default' };
  }
  // Ciclo cerrado por aceptación del propietario: solo lectura.
  if (isAcceptedByOwner(insp)) {
    return { label: 'Ver detalle', icon: <Eye className="mr-1 h-3.5 w-3.5" />, variant: 'outline' };
  }
  switch (insp.status) {
    case 'submitted':         return { label: 'Iniciar revisión',   icon: <Play       className="mr-1 h-3.5 w-3.5" />, variant: 'default' };
    case 'in_review':         return { label: 'Continuar revisión', icon: <FileSearch className="mr-1 h-3.5 w-3.5" />, variant: 'default' };
    case 'approved':          return { label: 'Publicar',           icon: <Send       className="mr-1 h-3.5 w-3.5" />, variant: 'default' };
    case 'published':         return { label: 'Abrir reporte',      icon: <ExternalLink className="mr-1 h-3.5 w-3.5" />, variant: 'outline' };
    case 'sent':              return { label: 'Abrir reporte',      icon: <ExternalLink className="mr-1 h-3.5 w-3.5" />, variant: 'outline' };
    case 'pending_assignment':return { label: 'Asignarme',          icon: <Eye        className="mr-1 h-3.5 w-3.5" />, variant: 'secondary' };
    default:                  return { label: 'Ver detalle',        icon: <Eye        className="mr-1 h-3.5 w-3.5" />, variant: 'outline' };
  }
}


export default function ExecutiveReviewQueue() {
  const { inspections, sectionsByInspection, inspectorProfiles, loading, error } = useExecutiveQueue();

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [marketFilter, setMarketFilter] = useState('all');
  const [inspectorFilter, setInspectorFilter] = useState('all');
  const [publishedFilter, setPublishedFilter] = useState('all');
  const [ownerFeedbackFilter, setOwnerFeedbackFilter] = useState<'all' | 'waiting' | 'pending_review' | 'accepted'>('all');
  const [sortKey, setSortKey] = useState<SortKey>(
    () => (localStorage.getItem('executive-queue-sort') as SortKey) || 'updated'
  );
  const persistSortKey = (s: SortKey) => { setSortKey(s); localStorage.setItem('executive-queue-sort', s); };

  const setStatusExclusive = (next: string) => {
    setStatusFilter(next);
    if (next !== 'all') setOwnerFeedbackFilter('all');
  };
  const setOwnerFeedbackExclusive = (next: 'all' | 'waiting' | 'pending_review' | 'accepted') => {
    setOwnerFeedbackFilter(next);
    if (next !== 'all') setStatusFilter('all');
  };

  const markets = useMemo(() => [...new Set(inspections.map(i => i.market).filter(Boolean))], [inspections]);
  const inspectors = useMemo(() => {
    const ids = [...new Set(inspections.map(i => i.inspector_id).filter(Boolean))] as string[];
    return ids.map(id => ({
      id,
      name: inspectorProfiles[id]?.full_name ?? inspectorProfiles[id]?.email ?? 'Inspector sin nombre',
    }));
  }, [inspections, inspectorProfiles]);

  const filtered = useMemo(() => inspections.filter(i => {
    if (search) {
      const q = search.toLowerCase();
      const match = [i.address, i.property_name, i.property_id].some(v => v?.toLowerCase().includes(q));
      if (!match) return false;
    }
    if (statusFilter !== 'all' && i.status !== statusFilter) return false;
    if (marketFilter !== 'all' && i.market !== marketFilter) return false;
    if (inspectorFilter !== 'all' && i.inspector_id !== inspectorFilter) return false;
    if (publishedFilter === 'published' && !i.published_at) return false;
    if (publishedFilter === 'not_published' && !!i.published_at) return false;
    if (ownerFeedbackFilter !== 'all') {
      const fb = i.owner_feedback_status ?? 'none';
      const isPub = i.status === 'published' || i.status === 'sent';
      if (ownerFeedbackFilter === 'waiting' && !(isPub && fb === 'none')) return false;
      if (ownerFeedbackFilter === 'pending_review' && !(isPub && fb === 'pending_executive_review')) return false;
      if (ownerFeedbackFilter === 'accepted' && fb !== 'accepted') return false;
    }
    return true;
  }), [inspections, search, statusFilter, marketFilter, inspectorFilter, publishedFilter, ownerFeedbackFilter]);

  const hasActiveFilter =
    search.trim() !== '' ||
    statusFilter !== 'all' ||
    marketFilter !== 'all' ||
    inspectorFilter !== 'all' ||
    publishedFilter !== 'all' ||
    ownerFeedbackFilter !== 'all';

  const kpis = useMemo(() => ({
    ownerFeedback:inspections.filter(i =>
      (i.status === 'published' || i.status === 'sent')
      && i.owner_feedback_status === 'pending_executive_review').length,
    forReview:    inspections.filter(i => i.status === 'submitted').length,
    inReview:     inspections.filter(i => i.status === 'in_review').length,
    toPublish:    inspections.filter(i => i.status === 'approved' && i.owner_feedback_status !== 'accepted').length,
    waitingOwner: inspections.filter(i =>
      (i.status === 'published' || i.status === 'sent')
      && (i.owner_feedback_status ?? 'none') === 'none').length,
    accepted:     inspections.filter(i => i.owner_feedback_status === 'accepted').length,
  }), [inspections]);

  // Per-bucket sorts. Action: oldest activity first (longest in state).
  // Follow-up: most recently published. Pre-inspección: updated desc.
  const sortedFiltered = useMemo(() => {
    const arr = [...filtered];
    if (sortKey === 'updated') {
      arr.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    } else {
      arr.sort((a, b) => {
        const dateA = getEffectiveSnapshot(a)?.fecha_recoleccion_llaves ? new Date(getEffectiveSnapshot(a)!.fecha_recoleccion_llaves as string).getTime() : Infinity;
        const dateB = getEffectiveSnapshot(b)?.fecha_recoleccion_llaves ? new Date(getEffectiveSnapshot(b)!.fecha_recoleccion_llaves as string).getTime() : Infinity;
        return sortKey === 'keys-asc' ? dateA - dateB : dateB - dateA;
      });
    }
    return arr;
  }, [filtered, sortKey]);

  const grouped = useMemo(() => {
    const buckets: Record<ExecutiveBucket, Inspection[]> = {
      owner_feedback: [], action: [], follow_up: [], pre_inspection: [],
    };
    sortedFiltered.forEach(i => { buckets[getExecutiveBucket(i)].push(i); });
    // Apply per-bucket secondary sort (override the global sortKey).
    buckets.owner_feedback.sort((a, b) => {
      const dA = a.owner_feedback_last_submitted_at ? new Date(a.owner_feedback_last_submitted_at).getTime() : 0;
      const dB = b.owner_feedback_last_submitted_at ? new Date(b.owner_feedback_last_submitted_at).getTime() : 0;
      return dB - dA;
    });
    buckets.action.sort((a, b) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime());
    buckets.follow_up.sort((a, b) => {
      const dA = a.published_at ? new Date(a.published_at).getTime() : 0;
      const dB = b.published_at ? new Date(b.published_at).getTime() : 0;
      return dB - dA;
    });
    return buckets;
  }, [sortedFiltered]);

  return (
    <ExecutiveLayout>
      <div className="p-6 space-y-6">
        <PageHeader
          title="Bandeja de revisión"
          description="Inspecciones que requieren tu acción + seguimiento operativo."
        />

        {loading ? (
          <LoadingState rows={4} />
        ) : error ? (
          <ErrorState onRetry={() => window.location.reload()} />
        ) : (
          <>
            {/* KPIs — ordenados según el ciclo real: revisión → publicación → propietario → cierre. */}
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
              <KpiCard label="Para revisar"  value={kpis.forReview}    icon={<FileSearch className="h-5 w-5 text-primary" />}       accent="blue"  tooltip="Inspecciones enviadas por el inspector que esperan tu revisión inicial." active={statusFilter === 'submitted'}     onClick={() => setStatusExclusive(statusFilter === 'submitted'     ? 'all' : 'submitted')} />
              <KpiCard label="En revisión"   value={kpis.inReview}     icon={<Eye className="h-5 w-5 text-primary" />}             accent="blue"  tooltip="Estás revisando estas inspecciones. Continúa para aprobarlas o pedir cambios." active={statusFilter === 'in_review'}      onClick={() => setStatusExclusive(statusFilter === 'in_review'      ? 'all' : 'in_review')} />
              <KpiCard label="Para publicar" value={kpis.toPublish}    icon={<Send className="h-5 w-5 text-primary" />}            accent="blue"  tooltip="Aprobadas internamente. Falta enviarlas al propietario." active={statusFilter === 'approved'}       onClick={() => setStatusExclusive(statusFilter === 'approved'       ? 'all' : 'approved')} />
              <KpiCard label="Esperando propietario" value={kpis.waitingOwner} icon={<Clock className="h-5 w-5 text-primary" />}    accent="blue" tooltip="Publicadas y enviadas al propietario. Aguardando su respuesta." active={ownerFeedbackFilter === 'waiting'} onClick={() => setOwnerFeedbackExclusive(ownerFeedbackFilter === 'waiting' ? 'all' : 'waiting')} />
              <KpiCard label="Feedback propietario" value={kpis.ownerFeedback} icon={<AlertCircle className="h-5 w-5 text-status-bad" />} accent="red" tooltip="El propietario solicitó cambios. Requiere tu acción para ajustar y reenviar." active={ownerFeedbackFilter === 'pending_review'} onClick={() => setOwnerFeedbackExclusive(ownerFeedbackFilter === 'pending_review' ? 'all' : 'pending_review')} />
              <KpiCard label="Aceptadas"     value={kpis.accepted}     icon={<CheckCircle2 className="h-5 w-5 text-accent" />}     accent="green" tooltip="El propietario aceptó la cotización. Ciclo cerrado." active={ownerFeedbackFilter === 'accepted'} onClick={() => setOwnerFeedbackExclusive(ownerFeedbackFilter === 'accepted' ? 'all' : 'accepted')} />
            </div>

            {/* Filters */}
            <FiltersBar>
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por dirección o propiedad..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9 h-9 rounded-lg bg-card"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px] h-9 text-caption rounded-lg bg-card"><SelectValue placeholder="Estado" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value="assigned">Asignada</SelectItem>
                  <SelectItem value="in_progress">En progreso</SelectItem>
                  <SelectItem value="submitted">Lista para revisión</SelectItem>
                  <SelectItem value="in_review">En revisión</SelectItem>
                  <SelectItem value="approved">Aprobada</SelectItem>
                  <SelectItem value="published">Publicada</SelectItem>
                  <SelectItem value="sent">Entregada</SelectItem>
                </SelectContent>
              </Select>
              {markets.length > 1 && (
                <Select value={marketFilter} onValueChange={setMarketFilter}>
                  <SelectTrigger className="w-[130px] h-9 text-caption rounded-lg bg-card"><SelectValue placeholder="Mercado" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los mercados</SelectItem>
                    {markets.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              {inspectors.length > 0 && (
                <Select value={inspectorFilter} onValueChange={setInspectorFilter}>
                  <SelectTrigger className="w-[170px] h-9 text-caption rounded-lg bg-card"><SelectValue placeholder="Inspector" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los inspectores</SelectItem>
                    {inspectors.map(ins => <SelectItem key={ins.id} value={ins.id}>{ins.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              <Select value={publishedFilter} onValueChange={setPublishedFilter}>
                <SelectTrigger className="w-[150px] h-9 text-caption rounded-lg bg-card"><SelectValue placeholder="Publicación" /></SelectTrigger>
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
                <DropdownMenuContent align="end" className="w-56">
                  {(Object.entries(SORT_LABELS) as [SortKey, string][]).map(([k, label]) => (
                    <DropdownMenuItem key={k} onClick={() => persistSortKey(k)} className="gap-2">
                      {sortKey === k
                        ? <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                        : <span className="h-3.5 w-3.5 shrink-0" />}
                      {label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </FiltersBar>

            {/* Content — 4 groups job-to-be-done */}
            {sortedFiltered.length === 0 ? (
              <EmptyState
                title="No hay inspecciones"
                description="No se encontraron inspecciones con los filtros aplicados."
              />
            ) : (
              <div className="space-y-6">
                <div className="space-y-3">
                  <GroupHeader tone="amber" label="Feedback del propietario" total={grouped.owner_feedback.length} />
                  {grouped.owner_feedback.length > 0 && (
                    <BucketSection inspections={grouped.owner_feedback} bucket="owner_feedback"
                      sectionsByInspection={sectionsByInspection} inspectorProfiles={inspectorProfiles} />
                  )}
                </div>

                <div className="space-y-3">
                  <GroupHeader tone="primary" label="Requieren tu acción" total={grouped.action.length} />
                  {grouped.action.length > 0 && (
                    <BucketSection inspections={grouped.action} bucket="action"
                      sectionsByInspection={sectionsByInspection} inspectorProfiles={inspectorProfiles} />
                  )}
                </div>



                {grouped.follow_up.length > 0 && (
                  <CollapsibleGroup label="Seguimiento" total={grouped.follow_up.length} defaultOpen={grouped.follow_up.length <= 3} forceOpen={hasActiveFilter}>
                    <BucketSection inspections={grouped.follow_up} bucket="follow_up"
                      sectionsByInspection={sectionsByInspection} inspectorProfiles={inspectorProfiles} />
                  </CollapsibleGroup>
                )}

                {grouped.pre_inspection.length > 0 && (
                  <CollapsibleGroup label="Pre-inspección" total={grouped.pre_inspection.length} defaultOpen={false} forceOpen={hasActiveFilter}
                    description="Inspecciones en etapas previas a la revisión ejecutiva.">
                    <BucketSection inspections={grouped.pre_inspection} bucket="pre_inspection"
                      sectionsByInspection={sectionsByInspection} inspectorProfiles={inspectorProfiles} />
                  </CollapsibleGroup>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </ExecutiveLayout>

  );
}

// ─── Group Header ──────────────────────────────────────
function GroupHeader({ tone, label, total }: { tone: 'primary' | 'muted' | 'amber'; label: string; total: number }) {
  const dotClass = tone === 'primary' ? 'bg-primary' : tone === 'amber' ? 'bg-status-bad' : 'bg-muted-foreground/40';
  const textClass = tone === 'primary' ? 'text-primary' : tone === 'amber' ? 'text-status-bad' : 'text-muted-foreground';
  return (
    <div className="flex items-center gap-3">
      <div className={cn('h-2 w-2 rounded-full', dotClass)} />
      <h2 className={cn('text-xs font-semibold uppercase tracking-wider', textClass)}>
        {label}
      </h2>
      <span className="text-xs text-muted-foreground">· {total}</span>
      <div className="flex-1 border-t border-border/60" />
    </div>
  );
}

// ─── Collapsible group wrapper ─────────────────────────
function CollapsibleGroup({
  label, total, defaultOpen = true, forceOpen = false, description, children,
}: {
  label: string;
  total: number;
  defaultOpen?: boolean;
  forceOpen?: boolean;
  description?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const isOpen = forceOpen || open;
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 text-left group"
      >
        <div className="h-2 w-2 rounded-full bg-muted-foreground/40" />
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground group-hover:text-foreground">
          {label}
        </h2>
        <span className="text-xs text-muted-foreground">· {total}</span>
        <div className="flex-1 border-t border-border/60" />
        <span className="text-xs text-muted-foreground">{isOpen ? '▾' : '▸'}</span>
      </button>
      {isOpen && (
        <>
          {description && <p className="text-caption text-muted-foreground ml-5 -mt-1">{description}</p>}
          {children}
        </>
      )}
    </div>
  );
}

// ─── Bucket Section ────────────────────────────────────
function BucketSection({
  inspections, bucket, sectionsByInspection, inspectorProfiles,
}: {
  inspections: Inspection[];
  bucket: ExecutiveBucket;
  sectionsByInspection: Record<string, SectionMeta[]>;
  inspectorProfiles: Record<string, { full_name?: string | null; email?: string | null }>;
}) {
  if (inspections.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {inspections.map(insp => (
        <InspectionRow
          key={insp.id}
          inspection={insp}
          bucket={bucket}
          sections={sectionsByInspection[insp.id] ?? []}
          inspectorName={insp.inspector_id ? inspectorProfiles[insp.inspector_id]?.full_name ?? null : null}
        />
      ))}
    </div>
  );
}


// ─── Inspection Row ────────────────────────────────────
function InspectionRow({
  inspection: insp, bucket, sections, inspectorName,
}: {
  inspection: Inspection;
  bucket: ExecutiveBucket;
  sections: SectionMeta[];
  inspectorName: string | null;
}) {
  const progress = useMemo(
    () => calculateProgress(sections as Pick<InspectionSection, 'status' | 'is_visible' | 'section_type'>[]),
    [sections],
  );
  const cta = useMemo(() => getContextualCTA(insp, bucket), [insp, bucket]);
  const isActionable = ACTIONABLE_BUCKETS.includes(bucket);

  const lastActive = insp.last_active_at
    ? formatDistanceToNow(new Date(insp.last_active_at), { addSuffix: true, locale: es })
    : null;

  const waitingLabel = useMemo(() => {
    if (bucket !== 'owner_feedback' || !insp.owner_feedback_last_submitted_at) return null;
    const days = Math.floor((Date.now() - new Date(insp.owner_feedback_last_submitted_at).getTime()) / 86_400_000);
    if (days <= 0) return 'Hoy';
    if (days === 1) return '1 día esperando';
    return `${days} días esperando`;
  }, [bucket, insp.owner_feedback_last_submitted_at]);


  const snapshot = getEffectiveSnapshot(insp);
  const keyDate = snapshot?.fecha_recoleccion_llaves as string | undefined;
  const contractEnd = snapshot?.fecha_de_termino_real_de_contrato as string | undefined;

  // Append T12:00:00 so date-only strings are parsed as local noon, not UTC
  // midnight (which shifts the display by one day in UTC-3/UTC-6 timezones).
  const keyDateLabel = keyDate
    ? new Date(`${keyDate}T12:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;
  const contractEndLabel = contractEnd
    ? new Date(`${contractEnd}T12:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  const showProgressBar = ['action', 'in_correction', 'pre_inspection'].includes(bucket);
  const reviewingLabel = bucket === 'action' || bucket === 'follow_up';
  const progressLabel = sections.length > 0
    ? (reviewingLabel
        ? `${progress.completed} de ${progress.total} secciones revisadas`
        : `${progress.completed} de ${progress.total} secciones completadas`)
    : null;

  return (
    <Link to={`/executive/inspection/${insp.id}`}>
      <Card className={cn(
        'border-0 shadow-sm hover:shadow-md transition-all ring-1 ring-border rounded-xl',
        isActionable && 'ring-primary/30 bg-primary/[0.018]',
      )}>
        <CardContent className="py-3 px-4">
          <div className="flex items-start justify-between gap-4">
            {/* ── Main info ── */}
            <div className="flex-1 min-w-0 space-y-1">
              {/* Line 1: name + status */}
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold leading-tight truncate">{insp.property_name ?? insp.property_id}</p>
                <StatusBadge inspection={insp} />
              </div>
              {/* Line 2: address · inspector */}
              <p className="text-caption text-muted-foreground truncate">
                {insp.address}
                {inspectorName && <span className="text-muted-foreground/60"> · {inspectorName}</span>}
              </p>
              {/* Line 3: meta */}
              <div className="flex items-center gap-x-3 text-tiny text-muted-foreground flex-wrap">
                {waitingLabel && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-status-bad/10 text-status-bad font-medium">
                    <Clock className="h-3 w-3" />
                    {waitingLabel}
                  </span>
                )}
                <span>{insp.market} · {insp.inspection_type}</span>
                <span className="flex items-center gap-1">
                  <Key className="h-3 w-3" />
                  {keyDateLabel ?? 'Sin fecha de recolección'}
                </span>

                {progressLabel && (
                  <span className="flex items-center gap-1.5">
                    {progressLabel}
                    {lastActive && <span className="text-muted-foreground/60 flex items-center gap-0.5"><Clock className="h-3 w-3" />{lastActive}</span>}
                  </span>
                )}
              </div>
            </div>

            {/* ── Action label pill ── */}
            <span className={cn(
              'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium shrink-0 mt-0.5',
              cta.variant === 'default'
                ? 'bg-primary text-primary-foreground'
                : cta.variant === 'outline'
                  ? 'border border-border text-muted-foreground'
                  : 'bg-muted text-muted-foreground',
            )}>
              {cta.icon}
              <span className="hidden sm:inline">{cta.label}</span>
              <ChevronRight className="h-3 w-3 opacity-60" />
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
