import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { InspectionStatusBadge } from '@/components/StatusBadge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { calculateProgress, getEffectiveSnapshot } from '@/lib/inspection-utils';
import { requiresFinalObservation } from '@/lib/section-completion';
import ExecutiveLayout from '@/components/ExecutiveLayout';
import type { Inspection, InspectionSection, Profile } from '@/lib/types';
import {
  FileSearch, Clock, Search,
  Eye, Send, ExternalLink, Play, CheckCircle2,
  AlertTriangle, RefreshCw, ArrowUpDown, Key,
} from 'lucide-react';
import { formatDistanceToNow, isBefore, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';

// ─── Types ─────────────────────────────────────────────
interface SectionMeta {
  status: string;
  is_visible: boolean;
  section_type: string;
  final_observation: string | null;
}

type SortKey = 'updated' | 'keys-asc' | 'keys-desc';

const SORT_LABELS: Record<SortKey, string> = {
  'updated': 'Última actividad',
  'keys-asc': 'Recolección: próxima primero',
  'keys-desc': 'Recolección: más lejana primero',
};

/**
 * Role-based bucketing for the EXECUTIVE view.
 *
 * Executive cares about review/approval/publication. States that belong to
 * admin (coordination) or inspector (execution) are still surfaced but as
 * CONTEXT, not as urgent tasks. Do NOT reintroduce admin-style urgency
 * (amber rings, warning pills) to states the executive cannot act on.
 */
type ExecutiveBucket =
  | 'to_review'
  | 'to_publish'
  | 'published'
  | 'in_field'
  | 'uncoordinated'
  | 'other';

function getExecutiveBucket(insp: Inspection): ExecutiveBucket {
  if (['submitted', 'in_review'].includes(insp.status)) return 'to_review';
  if (insp.status === 'approved' && !insp.published_at) return 'to_publish';
  if (!!insp.published_at && isBefore(subDays(new Date(), 30), new Date(insp.published_at))) return 'published';
  if (['assigned', 'in_progress'].includes(insp.status) && insp.started_at) return 'in_field';

  const snap = getEffectiveSnapshot(insp);
  const hasKey = !!snap?.fecha_recoleccion_llaves;
  const hasContractEnd = !!snap?.fecha_de_termino_real_de_contrato;
  if (!hasKey && hasContractEnd) return 'uncoordinated';

  return 'other';
}

const ACTIONABLE_BUCKETS: ExecutiveBucket[] = ['to_review', 'to_publish'];

// ─── Helpers ───────────────────────────────────────────
function getContextualCTA(
  insp: Inspection,
  sections: SectionMeta[],
): { label: string; icon: React.ReactNode; variant: 'default' | 'outline' | 'secondary' } {
  const isPublished = !!insp.published_at;
  const missingObs = sections.filter(
    s => s.is_visible && requiresFinalObservation(s.section_type) && !s.final_observation?.trim()
  ).length;

  if (isPublished && missingObs === 0) {
    return { label: 'Abrir reporte', icon: <ExternalLink className="mr-1 h-3.5 w-3.5" />, variant: 'outline' };
  }
  if (isPublished && missingObs > 0) {
    return { label: 'Republicar', icon: <RefreshCw className="mr-1 h-3.5 w-3.5" />, variant: 'secondary' };
  }
  if (insp.status === 'approved' && !isPublished) {
    return { label: 'Publicar', icon: <Send className="mr-1 h-3.5 w-3.5" />, variant: 'default' };
  }
  if (insp.status === 'in_review') {
    return { label: 'Continuar revisión', icon: <FileSearch className="mr-1 h-3.5 w-3.5" />, variant: 'default' };
  }
  if (insp.status === 'submitted') {
    return { label: 'Revisar', icon: <FileSearch className="mr-1 h-3.5 w-3.5" />, variant: 'default' };
  }
  if (insp.started_at) {
    return { label: 'Ver progreso', icon: <Play className="mr-1 h-3.5 w-3.5" />, variant: 'outline' };
  }
  return { label: 'Ver detalle', icon: <Eye className="mr-1 h-3.5 w-3.5" />, variant: 'outline' };
}

// ─── Main Component ────────────────────────────────────
export default function ExecutiveReviewQueue() {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [sectionsByInspection, setSectionsByInspection] = useState<Record<string, SectionMeta[]>>({});
  const [inspectorProfiles, setInspectorProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);

  // Filters — persisted
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [marketFilter, setMarketFilter] = useState('all');
  const [inspectorFilter, setInspectorFilter] = useState('all');
  const [publishedFilter, setPublishedFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>(() =>
    (localStorage.getItem('executive-queue-sort') as SortKey) || 'updated'
  );

  const persistSortKey = (s: SortKey) => { setSortKey(s); localStorage.setItem('executive-queue-sort', s); };

  useEffect(() => {
    const load = async () => {
      const { data: inspData } = await supabase
        .from('inspections').select('*').order('updated_at', { ascending: false });
      const insps = (inspData ?? []) as unknown as Inspection[];
      setInspections(insps);

      if (insps.length > 0) {
        const ids = insps.map(i => i.id);
        const { data: secData } = await supabase
          .from('inspection_sections')
          .select('inspection_id, status, is_visible, section_type, final_observation')
          .in('inspection_id', ids);

        const grouped: Record<string, SectionMeta[]> = {};
        for (const s of (secData ?? []) as any[]) {
          if (!grouped[s.inspection_id]) grouped[s.inspection_id] = [];
          grouped[s.inspection_id].push(s);
        }
        setSectionsByInspection(grouped);

        const inspectorIds = [...new Set(insps.map(i => i.inspector_id).filter(Boolean))] as string[];
        if (inspectorIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles').select('id, full_name, email, role')
            .in('id', inspectorIds);
          const profileMap: Record<string, Profile> = {};
          for (const p of (profiles ?? []) as unknown as Profile[]) {
            profileMap[p.id] = p;
          }
          setInspectorProfiles(profileMap);
        }
      }
      setLoading(false);
    };
    load();
  }, []);

  const markets = useMemo(() => [...new Set(inspections.map(i => i.market).filter(Boolean))], [inspections]);
  const inspectors = useMemo(() => {
    const ids = [...new Set(inspections.map(i => i.inspector_id).filter(Boolean))] as string[];
    return ids.map(id => ({ id, name: inspectorProfiles[id]?.full_name ?? inspectorProfiles[id]?.email ?? 'Inspector sin nombre' }));
  }, [inspections, inspectorProfiles]);

  const filtered = useMemo(() => {
    return inspections.filter(i => {
      if (search) {
        const q = search.toLowerCase();
        const match = [i.address, i.property_name, i.property_id]
          .some(v => v?.toLowerCase().includes(q));
        if (!match) return false;
      }
      if (statusFilter !== 'all' && i.status !== statusFilter) return false;
      if (marketFilter !== 'all' && i.market !== marketFilter) return false;
      if (inspectorFilter !== 'all' && i.inspector_id !== inspectorFilter) return false;
      if (publishedFilter === 'published' && !i.published_at) return false;
      if (publishedFilter === 'not_published' && !!i.published_at) return false;
      return true;
    });
  }, [inspections, search, statusFilter, marketFilter, inspectorFilter, publishedFilter]);

  const kpis = useMemo(() => {
    const pending = inspections.filter(i => !i.started_at && ['assigned', 'pending', 'pending_assignment'].includes(i.status)).length;
    const inProgress = inspections.filter(i => !!i.started_at && !['submitted', 'in_review', 'approved', 'published', 'sent'].includes(i.status)).length;
    const forReview = inspections.filter(i => ['submitted', 'in_review'].includes(i.status)).length;
    const published = inspections.filter(i => !!i.published_at).length;
    return { pending, inProgress, forReview, published };
  }, [inspections]);

  const sortedFiltered = useMemo(() => {
    const arr = [...filtered];
    if (sortKey === 'updated') {
      arr.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    } else {
      arr.sort((a, b) => {
        const snapA = getEffectiveSnapshot(a);
        const snapB = getEffectiveSnapshot(b);
        const dateA = snapA?.fecha_recoleccion_llaves ? new Date(snapA.fecha_recoleccion_llaves as string).getTime() : Infinity;
        const dateB = snapB?.fecha_recoleccion_llaves ? new Date(snapB.fecha_recoleccion_llaves as string).getTime() : Infinity;
        return sortKey === 'keys-asc' ? dateA - dateB : dateB - dateA;
      });
    }
    return arr;
  }, [filtered, sortKey]);

  const grouped = useMemo(() => {
    const buckets: Record<ExecutiveBucket, Inspection[]> = {
      to_review: [], to_publish: [], published: [], in_field: [], uncoordinated: [], other: [],
    };
    sortedFiltered.forEach(i => { buckets[getExecutiveBucket(i)].push(i); });
    return buckets;
  }, [sortedFiltered]);

  const actionableTotal = grouped.to_review.length + grouped.to_publish.length;
  const contextTotal = grouped.published.length + grouped.in_field.length + grouped.uncoordinated.length + grouped.other.length;

  return (
    <ExecutiveLayout>
      <div className="p-6 space-y-6">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        ) : (
          <>
            {/* KPI cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KPICard label="Pendientes de inicio" value={kpis.pending} icon={<Clock className="h-4 w-4" />} color="muted" />
              <KPICard label="En progreso" value={kpis.inProgress} icon={<Play className="h-4 w-4" />} color="regular" />
              <KPICard label="Listas para revisión" value={kpis.forReview} icon={<FileSearch className="h-4 w-4" />} color="primary" />
              <KPICard label="Publicadas" value={kpis.published} icon={<CheckCircle2 className="h-4 w-4" />} color="good" />
            </div>

            {/* Filter bar */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar por dirección o propiedad..." value={search}
                  onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px] h-9 text-caption"><SelectValue placeholder="Estado" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value="assigned">Asignada</SelectItem>
                  <SelectItem value="in_progress">En progreso</SelectItem>
                  <SelectItem value="submitted">Enviada</SelectItem>
                  <SelectItem value="in_review">En revisión</SelectItem>
                  <SelectItem value="approved">Aprobada</SelectItem>
                  <SelectItem value="published">Publicada</SelectItem>
                </SelectContent>
              </Select>
              {markets.length > 1 && (
                <Select value={marketFilter} onValueChange={setMarketFilter}>
                  <SelectTrigger className="w-[130px] h-9 text-caption"><SelectValue placeholder="Mercado" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los mercados</SelectItem>
                    {markets.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              {inspectors.length > 0 && (
                <Select value={inspectorFilter} onValueChange={setInspectorFilter}>
                  <SelectTrigger className="w-[170px] h-9 text-caption"><SelectValue placeholder="Inspector" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los inspectores</SelectItem>
                    {inspectors.map(ins => <SelectItem key={ins.id} value={ins.id}>{ins.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              <Select value={publishedFilter} onValueChange={setPublishedFilter}>
                <SelectTrigger className="w-[150px] h-9 text-caption"><SelectValue placeholder="Publicación" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="published">Solo publicadas</SelectItem>
                  <SelectItem value="not_published">Sin publicar</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortKey} onValueChange={(v) => persistSortKey(v as SortKey)}>
                <SelectTrigger className="w-[240px] h-9 text-caption">
                  <ArrowUpDown className="mr-1 h-3.5 w-3.5" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(SORT_LABELS) as [SortKey, string][]).map(([k, label]) => (
                    <SelectItem key={k} value={k}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Content */}
            {sortedFiltered.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                No se encontraron inspecciones
              </div>
            ) : (
              <div className="space-y-8">
                {actionableTotal > 0 && (
                  <div className="space-y-5">
                    <GroupHeader tone="primary" label="Accionable ahora" total={actionableTotal} />
                    <BucketSection title="Para revisar" count={grouped.to_review.length} inspections={grouped.to_review}
                      bucket="to_review" sectionsByInspection={sectionsByInspection} inspectorProfiles={inspectorProfiles} />
                    <BucketSection title="Listas para publicar" count={grouped.to_publish.length} inspections={grouped.to_publish}
                      bucket="to_publish" sectionsByInspection={sectionsByInspection} inspectorProfiles={inspectorProfiles} />
                  </div>
                )}
                {contextTotal > 0 && (
                  <div className="space-y-5">
                    <GroupHeader tone="muted" label="Contexto y seguimiento" total={contextTotal} />
                    <BucketSection title="Publicadas recientemente" count={grouped.published.length} inspections={grouped.published}
                      bucket="published" sectionsByInspection={sectionsByInspection} inspectorProfiles={inspectorProfiles} />
                    <BucketSection title="En curso del inspector" count={grouped.in_field.length} inspections={grouped.in_field}
                      bucket="in_field" sectionsByInspection={sectionsByInspection} inspectorProfiles={inspectorProfiles} />
                    <BucketSection title="Sin coordinar" count={grouped.uncoordinated.length} inspections={grouped.uncoordinated}
                      bucket="uncoordinated" sectionsByInspection={sectionsByInspection} inspectorProfiles={inspectorProfiles} />
                    <BucketSection title="Otras" count={grouped.other.length} inspections={grouped.other}
                      bucket="other" sectionsByInspection={sectionsByInspection} inspectorProfiles={inspectorProfiles} />
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </ExecutiveLayout>
  );
}

// ─── Group Header (Accionable vs Contexto) ─────────────
function GroupHeader({ tone, label, total }: { tone: 'primary' | 'muted'; label: string; total: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className={cn(
        "h-2 w-2 rounded-full",
        tone === 'primary' ? 'bg-primary' : 'bg-muted-foreground/40'
      )} />
      <h2 className={cn(
        "text-xs font-semibold uppercase tracking-wider",
        tone === 'primary' ? 'text-primary' : 'text-muted-foreground'
      )}>
        {label}
      </h2>
      <span className="text-xs text-muted-foreground">· {total}</span>
      <div className="flex-1 border-t border-border/60" />
    </div>
  );
}

// ─── KPI Card ──────────────────────────────────────────
function KPICard({ label, value, icon, color }: {
  label: string; value: number; icon: React.ReactNode;
  color: 'muted' | 'regular' | 'primary' | 'good';
}) {
  const colorMap = {
    muted: 'bg-muted/50 text-muted-foreground',
    regular: 'bg-status-regular-bg text-[hsl(var(--status-regular))]',
    primary: 'bg-primary/10 text-primary',
    good: 'bg-[hsl(var(--status-good))]/10 text-[hsl(var(--status-good))]',
  };
  return (
    <Card className="border-0 ring-1 ring-border shadow-sm">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={cn('flex items-center justify-center h-10 w-10 rounded-xl', colorMap[color])}>
          {icon}
        </div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-tiny text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Bucket Section ────────────────────────────────────
function BucketSection({ title, count, inspections, bucket, sectionsByInspection, inspectorProfiles }: {
  title: string; count: number;
  inspections: Inspection[];
  bucket: ExecutiveBucket;
  sectionsByInspection: Record<string, SectionMeta[]>;
  inspectorProfiles: Record<string, Profile>;
}) {
  if (count === 0) return null;
  return (
    <section>
      <h3 className="text-caption font-medium text-muted-foreground mb-2 ml-5">
        {title} <span className="text-muted-foreground/60">· {count}</span>
      </h3>
      <div className="space-y-2">
        {inspections.map(insp => (
          <InspectionRow key={insp.id} inspection={insp} bucket={bucket}
            sections={sectionsByInspection[insp.id] ?? []}
            inspectorName={insp.inspector_id ? inspectorProfiles[insp.inspector_id]?.full_name ?? null : null} />
        ))}
      </div>
    </section>
  );
}

// ─── Inspection Row ────────────────────────────────────
function InspectionRow({ inspection: insp, bucket, sections, inspectorName }: {
  inspection: Inspection;
  bucket: ExecutiveBucket;
  sections: SectionMeta[];
  inspectorName: string | null;
}) {
  const progress = useMemo(() => calculateProgress(sections as Pick<InspectionSection, 'status' | 'is_visible' | 'section_type'>[]), [sections]);
  const cta = useMemo(() => getContextualCTA(insp, sections), [insp, sections]);
  const isPublished = !!insp.published_at;
  const isActionable = ACTIONABLE_BUCKETS.includes(bucket);

  const lastActive = insp.last_active_at
    ? formatDistanceToNow(new Date(insp.last_active_at), { addSuffix: true, locale: es })
    : null;

  const missingObs = sections.filter(
    s => s.is_visible && requiresFinalObservation(s.section_type) && !s.final_observation?.trim()
  ).length;

  const snapshot = getEffectiveSnapshot(insp);
  const keyDate = snapshot?.fecha_recoleccion_llaves as string | undefined;
  const contractEnd = snapshot?.fecha_de_termino_real_de_contrato as string | undefined;

  const keyDateLabel = keyDate
    ? new Date(keyDate).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;
  const contractEndLabel = contractEnd
    ? new Date(contractEnd).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  // Progress wording: explicit + bucket-aware; only show bar for actionable/in_field
  const showProgressBar = isActionable || bucket === 'in_field';
  const progressLabel = sections.length > 0
    ? (bucket === 'to_review' || bucket === 'to_publish' || bucket === 'published'
        ? `${progress.completed} de ${progress.total} secciones revisadas`
        : `${progress.completed} de ${progress.total} secciones completadas`)
    : null;

  // Show a "missing observations" warning only when it is actually executive work
  const showMissingObsWarning = missingObs > 0 && !isPublished
    && ['submitted', 'in_review', 'approved'].includes(insp.status);

  return (
    <Link to={`/executive/inspection/${insp.id}`}>
      <Card className={cn(
        "border-0 shadow-sm hover:shadow-md transition-shadow ring-1 ring-border",
        // Subtle left accent only for actionable cards — no full-card warning rings.
        isActionable && "border-l-2 border-l-primary/60",
      )}>
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1 flex-1 min-w-0">
              {/* Row 1: Name + ONE main badge */}
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-medium truncate">{insp.property_name ?? insp.property_id}</p>
                {bucket === 'uncoordinated' ? (
                  <Badge variant="secondary" className="text-tiny font-normal text-muted-foreground">
                    Por coordinar
                  </Badge>
                ) : (
                  <InspectionStatusBadge status={insp.status} />
                )}
              </div>

              {/* Row 2: Address + meta */}
              <p className="text-caption text-muted-foreground truncate">{insp.address}</p>
              <div className="flex items-center gap-3 text-tiny text-muted-foreground flex-wrap">
                <span>{insp.market}</span>
                {inspectorName && <span className="font-medium text-foreground/70">Inspector: {inspectorName}</span>}
                <span>{insp.inspection_type}</span>
                {bucket === 'uncoordinated' ? (
                  <span>Término de contrato: {contractEndLabel ?? '—'}</span>
                ) : (
                  <span className="flex items-center gap-1">
                    <Key className="h-3 w-3" />
                    {keyDateLabel ? `Recolección: ${keyDateLabel}` : 'Sin fecha de recolección'}
                  </span>
                )}
              </div>

              {/* Row 3: Progress (explicit wording; bar only when actionable / in field) */}
              {progressLabel && (
                <div className="flex items-center gap-3 mt-0.5">
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

              {/* Row 4: Secondary warning text (only if actually actionable for the executive) */}
              {showMissingObsWarning && (
                <p className="text-tiny text-[hsl(var(--status-regular))] flex items-center gap-1 mt-0.5">
                  <AlertTriangle className="h-3 w-3" />
                  {missingObs} observaciones finales pendientes
                </p>
              )}
            </div>
            <Button variant={cta.variant} size="sm" className="shrink-0">
              {cta.icon} {cta.label}
            </Button>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
