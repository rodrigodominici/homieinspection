import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { calculateProgress, getEffectiveSnapshot } from '@/lib/inspection-utils';
import { requiresFinalObservation } from '@/lib/section-completion';
import ExecutiveLayout from '@/components/ExecutiveLayout';
import type { Inspection, InspectionSection } from '@/lib/types';
import type { SectionMeta } from '@/modules/inspection/api/inspections.service';
import {
  FileSearch, Clock, Search, Eye, Send, ExternalLink, Play, CheckCircle2,
  RefreshCw, ArrowUpDown, Key,
} from 'lucide-react';
import { formatDistanceToNow, isBefore, subDays } from 'date-fns';
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

// ─── Bucketing (job-to-be-done) ────────────────────
type ExecutiveBucket =
  | 'action'        // submitted, in_review, approved
  | 'in_correction' // needs_changes
  | 'follow_up'     // published, sent
  | 'pre_inspection'; // pending_assignment, assigned, in_progress

function getExecutiveBucket(insp: Inspection): ExecutiveBucket {
  if (['submitted', 'in_review', 'approved'].includes(insp.status)) return 'action';
  if (insp.status === 'needs_changes') return 'in_correction';
  if (['published', 'sent'].includes(insp.status)) return 'follow_up';
  return 'pre_inspection';
}

const ACTIONABLE_BUCKETS: ExecutiveBucket[] = ['action'];

type SortKey = 'updated' | 'keys-asc' | 'keys-desc';
const SORT_LABELS: Record<SortKey, string> = {
  'updated': 'Última actividad',
  'keys-asc': 'Recolección: próxima primero',
  'keys-desc': 'Recolección: más lejana primero',
};

type CTAInfo = { label: string; icon: React.ReactNode; variant: 'default' | 'outline' | 'secondary' };

function getContextualCTA(insp: Inspection): CTAInfo {
  switch (insp.status) {
    case 'submitted':         return { label: 'Iniciar revisión',   icon: <Play       className="mr-1 h-3.5 w-3.5" />, variant: 'default' };
    case 'in_review':         return { label: 'Continuar revisión', icon: <FileSearch className="mr-1 h-3.5 w-3.5" />, variant: 'default' };
    case 'needs_changes':     return { label: 'Ver correcciones',   icon: <Eye        className="mr-1 h-3.5 w-3.5" />, variant: 'outline' };
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
  const [sortKey, setSortKey] = useState<SortKey>(
    () => (localStorage.getItem('executive-queue-sort') as SortKey) || 'updated'
  );
  const persistSortKey = (s: SortKey) => { setSortKey(s); localStorage.setItem('executive-queue-sort', s); };

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
    return true;
  }), [inspections, search, statusFilter, marketFilter, inspectorFilter, publishedFilter]);

  const kpis = useMemo(() => ({
    pending:    inspections.filter(i => !i.started_at && ['assigned', 'pending', 'pending_assignment'].includes(i.status)).length,
    inProgress: inspections.filter(i => !!i.started_at && !['submitted', 'in_review', 'approved', 'published', 'sent'].includes(i.status)).length,
    forReview:  inspections.filter(i => ['submitted', 'in_review'].includes(i.status)).length,
    published:  inspections.filter(i => !!i.published_at).length,
  }), [inspections]);

  // Per-bucket sorts. Action: oldest activity first (longest in state).
  // En corrección: by contract end. Follow-up: most recently published.
  // Pre-inspección: updated desc.
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
      action: [], in_correction: [], follow_up: [], pre_inspection: [],
    };
    sortedFiltered.forEach(i => { buckets[getExecutiveBucket(i)].push(i); });
    // Apply per-bucket secondary sort (override the global sortKey).
    buckets.action.sort((a, b) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime());
    buckets.in_correction.sort((a, b) => {
      const dA = getEffectiveSnapshot(a)?.fecha_de_termino_real_de_contrato as string | undefined;
      const dB = getEffectiveSnapshot(b)?.fecha_de_termino_real_de_contrato as string | undefined;
      return (dA ? new Date(dA).getTime() : Infinity) - (dB ? new Date(dB).getTime() : Infinity);
    });
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
            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard label="Pendientes de inicio" value={kpis.pending} icon={<Clock className="h-5 w-5 text-muted-foreground" />} />
              <KpiCard label="En progreso"         value={kpis.inProgress} icon={<Play className="h-5 w-5 text-homie-orange" />} accent="amber" />
              <KpiCard label="Listas para revisión" value={kpis.forReview}  icon={<FileSearch className="h-5 w-5 text-primary" />} accent="blue" />
              <KpiCard label="Publicadas"          value={kpis.published}  icon={<CheckCircle2 className="h-5 w-5 text-accent" />} accent="green" />
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
                  <SelectItem value="needs_changes">Requiere cambios</SelectItem>
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
              <Select value={sortKey} onValueChange={(v) => persistSortKey(v as SortKey)}>
                <SelectTrigger className="w-[240px] h-9 text-caption rounded-lg bg-card">
                  <ArrowUpDown className="mr-1 h-3.5 w-3.5" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(SORT_LABELS) as [SortKey, string][]).map(([k, label]) => (
                    <SelectItem key={k} value={k}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                  <GroupHeader tone="primary" label="Requieren tu acción" total={grouped.action.length} />
                  {grouped.action.length === 0 ? (
                    <p className="text-caption text-muted-foreground ml-5">No hay inspecciones esperando tu acción.</p>
                  ) : (
                    <BucketSection inspections={grouped.action} bucket="action"
                      sectionsByInspection={sectionsByInspection} inspectorProfiles={inspectorProfiles} />
                  )}
                </div>

                {grouped.in_correction.length > 0 && (
                  <div className="space-y-3">
                    <GroupHeader tone="amber" label="En corrección" total={grouped.in_correction.length} />
                    <p className="text-caption text-muted-foreground ml-5 -mt-1">
                      Esperando que el inspector realice las correcciones solicitadas.
                    </p>
                    <BucketSection inspections={grouped.in_correction} bucket="in_correction"
                      sectionsByInspection={sectionsByInspection} inspectorProfiles={inspectorProfiles} />
                  </div>
                )}

                {grouped.follow_up.length > 0 && (
                  <CollapsibleGroup label="Seguimiento" total={grouped.follow_up.length} defaultOpen={grouped.follow_up.length <= 3}>
                    <BucketSection inspections={grouped.follow_up} bucket="follow_up"
                      sectionsByInspection={sectionsByInspection} inspectorProfiles={inspectorProfiles} />
                  </CollapsibleGroup>
                )}

                {grouped.pre_inspection.length > 0 && (
                  <CollapsibleGroup label="Pre-inspección" total={grouped.pre_inspection.length} defaultOpen={false}
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
  const dotClass = tone === 'primary' ? 'bg-primary' : tone === 'amber' ? 'bg-homie-orange' : 'bg-muted-foreground/40';
  const textClass = tone === 'primary' ? 'text-primary' : tone === 'amber' ? 'text-homie-orange' : 'text-muted-foreground';
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
  label, total, defaultOpen = true, description, children,
}: {
  label: string;
  total: number;
  defaultOpen?: boolean;
  description?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
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
        <span className="text-xs text-muted-foreground">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
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
    <div className="space-y-1.5">
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
  const cta = useMemo(() => getContextualCTA(insp), [insp]);
  const isActionable = ACTIONABLE_BUCKETS.includes(bucket);

  const lastActive = insp.last_active_at
    ? formatDistanceToNow(new Date(insp.last_active_at), { addSuffix: true, locale: es })
    : null;

  const snapshot = getEffectiveSnapshot(insp);
  const keyDate = snapshot?.fecha_recoleccion_llaves as string | undefined;
  const contractEnd = snapshot?.fecha_de_termino_real_de_contrato as string | undefined;

  const keyDateLabel = keyDate
    ? new Date(keyDate).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;
  const contractEndLabel = contractEnd
    ? new Date(contractEnd).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
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
        'border-0 shadow-sm hover:shadow-md transition-shadow ring-1 ring-border rounded-xl',
        isActionable && 'border-l-2 border-l-primary/60',
      )}>
        <CardContent className="py-2 px-3">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5 flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-medium truncate">{insp.property_name ?? insp.property_id}</p>
                <StatusBadge status={insp.status} />
              </div>
              <p className="text-caption text-muted-foreground truncate">{insp.address}</p>
              <div className="flex items-center gap-x-2 gap-y-0.5 text-tiny text-muted-foreground flex-wrap">
                <span>{insp.market}</span>
                {inspectorName && <span className="font-medium text-foreground/70">Inspector: {inspectorName}</span>}
                <span>{insp.inspection_type}</span>
                {bucket === 'in_correction' && contractEndLabel ? (
                  <span>Término: {contractEndLabel}</span>
                ) : (
                  <span className="flex items-center gap-1">
                    <Key className="h-3 w-3" />
                    {keyDateLabel ? `Recolección: ${keyDateLabel}` : 'Sin fecha de recolección'}
                  </span>
                )}
              </div>

              {progressLabel && (
                <div className="flex items-center gap-3">
                  {showProgressBar && (
                    <div className="flex items-center gap-2 flex-1 max-w-[180px]">
                      <Progress value={progress.percent} className="h-1.5" />
                    </div>
                  )}
                  <span className="text-tiny text-muted-foreground shrink-0">{progressLabel}</span>
                  {lastActive && (
                    <span className="text-tiny text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {lastActive}
                    </span>
                  )}
                </div>
              )}
            </div>
            <Button variant={cta.variant} size="sm" className="shrink-0 rounded-lg">
              {cta.icon} {cta.label}
            </Button>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
