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
  FileSearch, Clock, Search, List, CalendarDays,
  Eye, Send, ExternalLink, Play, CheckCircle2,
  AlertTriangle, RefreshCw, ArrowUpDown, Key,
} from 'lucide-react';
import { formatDistanceToNow, isToday, isTomorrow, isAfter, isBefore, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';

// ─── Types ─────────────────────────────────────────────
interface SectionMeta {
  status: string;
  is_visible: boolean;
  section_type: string;
  final_observation: string | null;
}

type ViewMode = 'list' | 'calendar';
type SortKey = 'updated' | 'keys-asc' | 'keys-desc';

const SORT_LABELS: Record<SortKey, string> = {
  'updated': 'Última actividad',
  'keys-asc': 'Recolección: próxima primero',
  'keys-desc': 'Recolección: más lejana primero',
};

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
  if (['submitted', 'in_review'].includes(insp.status)) {
    return { label: 'Revisar', icon: <FileSearch className="mr-1 h-3.5 w-3.5" />, variant: 'default' };
  }
  if (insp.started_at) {
    return { label: 'Ver progreso', icon: <Play className="mr-1 h-3.5 w-3.5" />, variant: 'outline' };
  }
  return { label: 'Ver detalle', icon: <Eye className="mr-1 h-3.5 w-3.5" />, variant: 'outline' };
}

function getBucket(insp: Inspection): 'review' | 'active' | 'published' | 'other' {
  if (['submitted', 'in_review'].includes(insp.status)) return 'review';
  if (!!insp.published_at && isBefore(subDays(new Date(), 30), new Date(insp.published_at))) return 'published';
  if (['assigned', 'in_progress'].includes(insp.status) && insp.started_at) return 'active';
  return 'other';
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
  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    (localStorage.getItem('executive-queue-view') as ViewMode) || 'list'
  );
  const [sortKey, setSortKey] = useState<SortKey>(() =>
    (localStorage.getItem('executive-queue-sort') as SortKey) || 'updated'
  );

  const persistViewMode = (v: ViewMode) => { setViewMode(v); localStorage.setItem('executive-queue-view', v); };
  const persistSortKey = (s: SortKey) => { setSortKey(s); localStorage.setItem('executive-queue-sort', s); };

  useEffect(() => {
    const load = async () => {
      const { data: inspData } = await supabase
        .from('inspections').select('*').order('updated_at', { ascending: false });
      const insps = (inspData ?? []) as unknown as Inspection[];
      setInspections(insps);

      // Batch-fetch sections with final_observation
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

        // Batch-fetch inspector profiles
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

  // Derived filter options
  const markets = useMemo(() => [...new Set(inspections.map(i => i.market).filter(Boolean))], [inspections]);
  const inspectors = useMemo(() => {
    const ids = [...new Set(inspections.map(i => i.inspector_id).filter(Boolean))] as string[];
    return ids.map(id => ({ id, name: inspectorProfiles[id]?.full_name ?? id }));
  }, [inspections, inspectorProfiles]);

  // Filtered inspections
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

  // KPIs
  const kpis = useMemo(() => {
    const pending = inspections.filter(i => !i.started_at && ['assigned', 'pending', 'pending_assignment'].includes(i.status)).length;
    const inProgress = inspections.filter(i => !!i.started_at && !['submitted', 'in_review', 'approved', 'published', 'sent'].includes(i.status)).length;
    const forReview = inspections.filter(i => ['submitted', 'in_review'].includes(i.status)).length;
    const published = inspections.filter(i => !!i.published_at).length;
    return { pending, inProgress, forReview, published };
  }, [inspections]);

  // Sort filtered
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

  // Grouped by bucket
  const grouped = useMemo(() => {
    const buckets: Record<string, Inspection[]> = { review: [], active: [], published: [], other: [] };
    sortedFiltered.forEach(i => { buckets[getBucket(i)].push(i); });
    return buckets;
  }, [sortedFiltered]);

  // Calendar grouping
  const calendarGroups = useMemo(() => {
    const groups: Record<string, Inspection[]> = {};
    const sorted = [...sortedFiltered].sort((a, b) => {
      const da = a.scheduled_at ? new Date(a.scheduled_at).getTime() : Infinity;
      const db = b.scheduled_at ? new Date(b.scheduled_at).getTime() : Infinity;
      return da - db;
    });
    for (const insp of sorted) {
      let key = 'Sin agendar';
      if (insp.scheduled_at) {
        const d = new Date(insp.scheduled_at);
        if (isToday(d)) key = 'Hoy';
        else if (isTomorrow(d)) key = 'Mañana';
        else if (isAfter(d, new Date())) key = d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'short' });
        else key = d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'short' }) + ' (pasado)';
      }
      if (!groups[key]) groups[key] = [];
      groups[key].push(insp);
    }
    return groups;
  }, [sortedFiltered]);

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
              <div className="ml-auto flex items-center border rounded-lg overflow-hidden">
                <button onClick={() => persistViewMode('list')}
                  className={cn('p-2 transition-colors', viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>
                  <List className="h-4 w-4" />
                </button>
                <button onClick={() => persistViewMode('calendar')}
                  className={cn('p-2 transition-colors', viewMode === 'calendar' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>
                  <CalendarDays className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Content */}
            {sortedFiltered.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                No se encontraron inspecciones
              </div>
            ) : viewMode === 'list' ? (
              <div className="space-y-6">
                <BucketSection title="Requieren revisión" count={grouped.review.length} inspections={grouped.review}
                  sectionsByInspection={sectionsByInspection} inspectorProfiles={inspectorProfiles} />
                <BucketSection title="En curso" count={grouped.active.length} inspections={grouped.active}
                  sectionsByInspection={sectionsByInspection} inspectorProfiles={inspectorProfiles} />
                <BucketSection title="Publicadas recientemente" count={grouped.published.length} inspections={grouped.published}
                  sectionsByInspection={sectionsByInspection} inspectorProfiles={inspectorProfiles} />
                <BucketSection title="Otras inspecciones" count={grouped.other.length} inspections={grouped.other}
                  sectionsByInspection={sectionsByInspection} inspectorProfiles={inspectorProfiles} />
              </div>
            ) : (
              <div className="space-y-6">
                {Object.entries(calendarGroups).map(([label, insps]) => (
                  <BucketSection key={label} title={label} count={insps.length} inspections={insps}
                    sectionsByInspection={sectionsByInspection} inspectorProfiles={inspectorProfiles} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </ExecutiveLayout>
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
function BucketSection({ title, count, inspections, sectionsByInspection, inspectorProfiles }: {
  title: string; count: number;
  inspections: Inspection[];
  sectionsByInspection: Record<string, SectionMeta[]>;
  inspectorProfiles: Record<string, Profile>;
}) {
  if (count === 0) return null;
  return (
    <section>
      <h2 className="text-caption font-medium text-muted-foreground uppercase tracking-wider mb-3">
        {title} ({count})
      </h2>
      <div className="space-y-3">
        {inspections.map(insp => (
          <InspectionRow key={insp.id} inspection={insp}
            sections={sectionsByInspection[insp.id] ?? []}
            inspectorName={insp.inspector_id ? inspectorProfiles[insp.inspector_id]?.full_name ?? null : null} />
        ))}
      </div>
    </section>
  );
}

// ─── Inspection Row ────────────────────────────────────
function InspectionRow({ inspection: insp, sections, inspectorName }: {
  inspection: Inspection;
  sections: SectionMeta[];
  inspectorName: string | null;
}) {
  const progress = useMemo(() => calculateProgress(sections as Pick<InspectionSection, 'status' | 'is_visible' | 'section_type'>[]), [sections]);
  const cta = useMemo(() => getContextualCTA(insp, sections), [insp, sections]);
  const isPublished = !!insp.published_at;

  const lastActive = insp.last_active_at
    ? formatDistanceToNow(new Date(insp.last_active_at), { addSuffix: true, locale: es })
    : null;

  const missingObs = sections.filter(
    s => s.is_visible && requiresFinalObservation(s.section_type) && !s.final_observation?.trim()
  ).length;

  const snapshot = getEffectiveSnapshot(insp);
  const keyDate = snapshot?.fecha_recoleccion_llaves as string | undefined;
  const keyDateLabel = keyDate
    ? new Date(keyDate).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  return (
    <Link to={`/executive/inspection/${insp.id}`}>
      <Card className="border-0 ring-1 ring-border shadow-sm hover:shadow-md transition-shadow">
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1 flex-1 min-w-0">
              {/* Row 1: Name + badges */}
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-medium truncate">{insp.property_name ?? insp.property_id}</p>
                <InspectionStatusBadge status={insp.status} />
                {missingObs > 0 && !isPublished && ['submitted', 'in_review', 'approved'].includes(insp.status) && (
                  <Badge variant="outline" className="text-tiny border-[hsl(var(--status-regular))]/30 text-[hsl(var(--status-regular))]">
                    <AlertTriangle className="mr-1 h-3 w-3" />{missingObs} obs. pendientes
                  </Badge>
                )}
              </div>
              {/* Row 2: Address + meta */}
              <p className="text-caption text-muted-foreground truncate">{insp.address}</p>
              <div className="flex items-center gap-3 text-tiny text-muted-foreground flex-wrap">
                <span>{insp.market}</span>
                {inspectorName && <span className="font-medium text-foreground/70">Inspector: {inspectorName}</span>}
                <span>{insp.inspection_type}</span>
                <span className="flex items-center gap-1">
                  <Key className="h-3 w-3" />
                  {keyDateLabel ? `Recolección: ${keyDateLabel}` : 'Sin fecha de recolección'}
                </span>
              </div>
              {/* Row 3: Progress */}
              {sections.length > 0 && (
                <div className="flex items-center gap-3 mt-0.5">
                  <div className="flex items-center gap-2 flex-1 max-w-[200px]">
                    <Progress value={progress.percent} className="h-1.5" />
                    <span className="text-tiny text-muted-foreground shrink-0">{progress.completed}/{progress.total}</span>
                  </div>
                  {lastActive && (
                    <span className="text-tiny text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {lastActive}
                    </span>
                  )}
                </div>
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
