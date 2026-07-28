import { useEffect, useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import InspectorStatusBadge from '@/components/InspectorStatusBadge';
import InspectionTypeChip from '@/components/inspector/InspectionTypeChip';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import InspectorBottomNav from '@/components/InspectorBottomNav';
import { calculateProgress, getEffectiveSnapshot } from '@/lib/inspection-utils';
import { useInspectorInspections } from '@/modules/inspection/api/useInspectorInspections';
import type { Inspection, InspectionSection } from '@/lib/types';
import { MapPin, ClipboardList, FileText, Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getInspectorDisplayState, isCompletedToday, matchesInspectorStateFilter } from '@/lib/inspector-operational';
import { getContractDateShortLabel } from '@/lib/inspection-type-labels';

const ACTIVE_STATUSES = new Set(['assigned', 'in_progress', 'pending_assignment']);
const PAST_STATUSES = new Set(['submitted', 'in_review', 'approved', 'published', 'sent']);

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

interface InspectionWithProgress extends Inspection {
  totalSections: number;
  completedSections: number;
  scheduleDatetime: Date | null;
  contractEndDate: Date | null;
}

export default function InspectorAllInspections() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { inspections: raw, sectionsByInspection, loading } = useInspectorInspections();
  const [filter, setFilter] = useState<'active' | 'past'>(() => {
    const fromUrl = searchParams.get('filter');
    return fromUrl === 'past' ? 'past' : 'active';
  });

  const inspections = useMemo<InspectionWithProgress[]>(() => {
    return raw.map((insp) => {
      const sections = sectionsByInspection[insp.id] ?? [];
      const progress = calculateProgress(sections as unknown as Pick<InspectionSection, 'status' | 'is_visible' | 'section_type'>[]);
      const snapshot = getEffectiveSnapshot(insp);
      const scheduleDatetime = parseDateTimeField(
        snapshot?.fecha_recoleccion_llaves,
        snapshot?.hora_recoleccion_llaves
      );
      const contractEndDate = parseDateField(snapshot?.fecha_de_termino_real_de_contrato);
      return { ...insp, totalSections: progress.total, completedSections: progress.completed, scheduleDatetime, contractEndDate };
    });
  }, [raw, sectionsByInspection]);


  useEffect(() => {
    const fromUrl = searchParams.get('filter');
    const nextFilter = fromUrl === 'past' ? 'past' : 'active';
    if (nextFilter !== filter) setFilter(nextFilter);
  }, [searchParams, filter]);

  const stateFilter = searchParams.get('state');
  const scopeFilter = searchParams.get('scope');

  const handleFilterChange = (next: 'active' | 'past') => {
    setFilter(next);
    const params = new URLSearchParams(searchParams);
    params.set('filter', next);
    params.delete('state');
    params.delete('scope');
    setSearchParams(params, { replace: true });
  };

  const filtered = useMemo(() => {
    let items = inspections
      .filter((i) => (filter === 'active' ? ACTIVE_STATUSES.has(i.status) : PAST_STATUSES.has(i.status)))
      .filter((i) => matchesInspectorStateFilter(stateFilter, i, i.completedSections, i.totalSections, i as unknown as Inspection))
      .filter((i) => {
        if (scopeFilter !== 'completed_today') return true;
        return isCompletedToday(i);
      });

    // Default sort for active: contract-end nearest first (nulls last), then schedule nearest (nulls last)
    if (filter === 'active') {
      items = [...items].sort((a, b) => {
        const contractSort = nullSafeSort(a.contractEndDate, b.contractEndDate, true);
        if (contractSort !== 0) return contractSort;
        return nullSafeSort(a.scheduleDatetime, b.scheduleDatetime, true);
      });
    }

    return items;
  }, [inspections, filter, stateFilter, scopeFilter]);

  const isUncoordinated = (insp: InspectionWithProgress) =>
    !insp.scheduleDatetime && !!insp.contractEndDate && ACTIVE_STATUSES.has(insp.status);

  return (
    <div className="min-h-screen bg-muted/30 pb-24">
      <header className="px-5 pt-6 pb-3">
        <h1 className="text-xl font-bold text-foreground">Inspecciones</h1>
      </header>

      {/* Toggle */}
      <div className="px-4 pb-4">
        <div className="flex bg-card rounded-xl p-1 shadow-sm">
          <button
            onClick={() => handleFilterChange('active')}
            className={cn(
              'flex-1 py-2 rounded-lg text-sm font-medium transition-all',
              filter === 'active' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground'
            )}
          >
            Activas
          </button>
          <button
            onClick={() => handleFilterChange('past')}
            className={cn(
              'flex-1 py-2 rounded-lg text-sm font-medium transition-all',
              filter === 'past' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground'
            )}
          >
            Pasadas
          </button>
        </div>
      </div>

      <main className="px-4 space-y-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <ClipboardList className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">
              {filter === 'active' ? 'Sin inspecciones activas' : 'Sin inspecciones pasadas'}
            </p>
          </div>
        ) : (
          filtered.map((insp) => {
            const uncoord = isUncoordinated(insp);
            const progress = insp.totalSections > 0 ? Math.round((insp.completedSections / insp.totalSections) * 100) : 0;
            const displayState = getInspectorDisplayState(insp, insp.completedSections, insp.totalSections, insp as unknown as Inspection);

            if (uncoord) {
              // Por coordinar card — distinct pattern, no progress bar
              return (
                <Link key={insp.id} to={`/inspector/inspection/${insp.id}`} className="block">
                  <Card className="border-0 ring-1 ring-amber-200 border-dashed shadow-sm rounded-2xl active:scale-[0.99] transition-transform">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <p className="font-semibold text-sm truncate">{insp.property_name ?? insp.property_id}</p>
                            <InspectionTypeChip type={insp.inspection_type} />
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{insp.address ?? 'Sin dirección'}</span>
                          </div>
                        </div>
                        <span className="inline-flex items-center text-[10px] font-semibold text-amber-700 bg-amber-50 rounded-full px-2 py-0.5 shrink-0">
                          Por coordinar
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-amber-700">
                        <FileText className="h-3 w-3 shrink-0" />
                        <span>{getContractDateShortLabel(insp.inspection_type)}: {insp.contractEndDate!.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            }

            // Standard programmed/active card
            return (
              <Link key={insp.id} to={`/inspector/inspection/${insp.id}`} className="block">
                <Card className="border-0 ring-1 ring-border shadow-sm rounded-2xl active:scale-[0.99] transition-transform">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <p className="font-semibold text-sm truncate">{insp.property_name ?? insp.property_id}</p>
                          <InspectionTypeChip type={insp.inspection_type} />
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{insp.address ?? 'Sin dirección'}</span>
                        </div>
                      </div>
                      <InspectorStatusBadge state={displayState} />
                    </div>
                    {insp.scheduleDatetime && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                        <CalendarIcon className="h-3 w-3 shrink-0" />
                        <span>Inspección: {insp.scheduleDatetime.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })} {insp.scheduleDatetime.getHours() > 0 ? insp.scheduleDatetime.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                      </div>
                    )}
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{insp.completedSections} de {insp.totalSections}</span>
                        <span>{progress}%</span>
                      </div>
                      <Progress value={progress} className="h-2 rounded-full" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })
        )}
      </main>
      <InspectorBottomNav />
    </div>
  );
}
