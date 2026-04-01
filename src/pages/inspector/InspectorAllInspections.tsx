import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import InspectorStatusBadge from '@/components/InspectorStatusBadge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import InspectorBottomNav from '@/components/InspectorBottomNav';
import { calculateProgress } from '@/lib/inspection-utils';
import type { Inspection, InspectionSection } from '@/lib/types';
// Import Inspection type for full inspection pass to filter helpers
import { MapPin, ClipboardList } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getInspectorDisplayState, isCompletedToday, matchesInspectorStateFilter } from '@/lib/inspector-operational';

const ACTIVE_STATUSES = new Set(['assigned', 'in_progress', 'needs_changes', 'pending_assignment']);
const PAST_STATUSES = new Set(['submitted', 'in_review', 'approved', 'published', 'sent']);

interface InspectionWithProgress extends Inspection {
  totalSections: number;
  completedSections: number;
}

export default function InspectorAllInspections() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [inspections, setInspections] = useState<InspectionWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'active' | 'past'>(() => {
    const fromUrl = searchParams.get('filter');
    return fromUrl === 'past' ? 'past' : 'active';
  });

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('inspections').select('*').order('updated_at', { ascending: false });
      if (!data) { setLoading(false); return; }
      const withProgress = await Promise.all(
        (data as unknown as Inspection[]).map(async (insp) => {
          const { data: sections } = await supabase
            .from('inspection_sections').select('id, status, is_visible, section_type').eq('inspection_id', insp.id);
          const progress = calculateProgress((sections ?? []) as unknown as Pick<InspectionSection, 'status' | 'is_visible' | 'section_type'>[]);
          return { ...insp, totalSections: progress.total, completedSections: progress.completed };
        })
      );
      setInspections(withProgress);
      setLoading(false);
    };
    load();
  }, []);

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

  const filtered = inspections
    .filter((i) => (filter === 'active' ? ACTIVE_STATUSES.has(i.status) : PAST_STATUSES.has(i.status)))
    .filter((i) => matchesInspectorStateFilter(stateFilter, i, i.completedSections, i.totalSections, i as unknown as Inspection))
    .filter((i) => {
      if (scopeFilter !== 'completed_today') return true;
      return isCompletedToday(i);
    });

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

      <main className="px-4 space-y-4">
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
            const progress = insp.totalSections > 0 ? Math.round((insp.completedSections / insp.totalSections) * 100) : 0;
            const displayState = getInspectorDisplayState(insp, insp.completedSections, insp.totalSections, insp as unknown as Inspection);
            return (
              <Link key={insp.id} to={`/inspector/inspection/${insp.id}`}>
                <Card className="border-0 ring-1 ring-border shadow-sm rounded-2xl active:scale-[0.99] transition-transform">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{insp.property_name ?? insp.property_id}</p>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{insp.address ?? 'Sin dirección'}</span>
                        </div>
                      </div>
                      <InspectorStatusBadge state={displayState} />
                    </div>
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
