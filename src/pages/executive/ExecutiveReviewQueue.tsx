import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { InspectionStatusBadge } from '@/components/StatusBadge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { calculateProgress } from '@/lib/inspection-utils';
import type { Inspection, InspectionSection } from '@/lib/types';
import { LogOut, FileSearch, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

export default function ExecutiveReviewQueue() {
  const { profile, signOut } = useAuth();
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [sectionsByInspection, setSectionsByInspection] = useState<Record<string, Pick<InspectionSection, 'status' | 'is_visible' | 'section_type'>[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: inspData } = await supabase
        .from('inspections').select('*').order('updated_at', { ascending: false });
      const insps = (inspData ?? []) as unknown as Inspection[];
      setInspections(insps);

      // Batch-fetch sections for all inspections
      if (insps.length > 0) {
        const ids = insps.map(i => i.id);
        const { data: secData } = await supabase
          .from('inspection_sections')
          .select('inspection_id, status, is_visible, section_type')
          .in('inspection_id', ids);

        const grouped: Record<string, Pick<InspectionSection, 'status' | 'is_visible' | 'section_type'>[]> = {};
        for (const s of (secData ?? []) as any[]) {
          if (!grouped[s.inspection_id]) grouped[s.inspection_id] = [];
          grouped[s.inspection_id].push(s);
        }
        setSectionsByInspection(grouped);
      }
      setLoading(false);
    };
    load();
  }, []);

  const reviewQueue = inspections.filter((i) => ['submitted', 'in_review'].includes(i.status));
  const otherInspections = inspections.filter((i) => !['submitted', 'in_review'].includes(i.status));

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-card/80 backdrop-blur-sm">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary">
              <span className="text-sm font-bold text-primary-foreground">H</span>
            </div>
            <div>
              <h1 className="text-h4">Cola de Revisión</h1>
              <p className="text-tiny text-muted-foreground">{profile?.full_name}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={signOut}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="container py-6 space-y-6">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        ) : (
          <>
            {reviewQueue.length > 0 && (
              <section>
                <h2 className="text-caption font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  Pendientes de Revisión ({reviewQueue.length})
                </h2>
                <div className="space-y-3">
                  {reviewQueue.map((insp) => (
                    <InspectionRow key={insp.id} inspection={insp} sections={sectionsByInspection[insp.id] ?? []} />
                  ))}
                </div>
              </section>
            )}
            {otherInspections.length > 0 && (
              <section>
                <h2 className="text-caption font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  Otras Inspecciones
                </h2>
                <div className="space-y-3">
                  {otherInspections.map((insp) => (
                    <InspectionRow key={insp.id} inspection={insp} sections={sectionsByInspection[insp.id] ?? []} />
                  ))}
                </div>
              </section>
            )}
            {inspections.length === 0 && (
              <div className="py-12 text-center text-muted-foreground">
                No tienes inspecciones asignadas
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function InspectionRow({ inspection: insp, sections }: {
  inspection: Inspection;
  sections: Pick<InspectionSection, 'status' | 'is_visible' | 'section_type'>[];
}) {
  const progress = useMemo(() => calculateProgress(sections), [sections]);
  const started = !!insp.started_at;
  const progressLabel = !started ? 'Pendiente de inicio' : progress.percent === 100 ? 'Lista para revisión' : 'Inspección iniciada';
  const lastActive = insp.last_active_at
    ? formatDistanceToNow(new Date(insp.last_active_at), { addSuffix: true, locale: es })
    : null;

  return (
    <Link to={`/executive/inspection/${insp.id}`}>
      <Card className="border-0 ring-1 ring-border shadow-sm hover:shadow-md transition-shadow">
        <CardContent className="py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1.5 flex-1 min-w-0">
              <div className="flex items-center gap-3">
                <p className="font-medium truncate">{insp.property_name ?? insp.property_id}</p>
                <InspectionStatusBadge status={insp.status} />
                {insp.published_at && (
                  <Badge className="bg-[hsl(var(--status-good))]/15 text-[hsl(var(--status-good))] text-tiny border-0">
                    Publicado
                  </Badge>
                )}
              </div>
              <p className="text-caption text-muted-foreground truncate">{insp.address}</p>
              <div className="flex items-center gap-3 text-tiny text-muted-foreground">
                <span>{insp.market}</span>
                <span>{insp.typology}</span>
                <span>{insp.inspection_type}</span>
              </div>
              {/* Inspector progress row */}
              {sections.length > 0 && (
                <div className="flex items-center gap-3 mt-1">
                  <Badge variant={started ? (progress.percent === 100 ? 'default' : 'secondary') : 'outline'} className="text-tiny h-5">
                    {progressLabel}
                  </Badge>
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
            <Button variant="outline" size="sm" className="shrink-0">
              <FileSearch className="mr-1 h-3.5 w-3.5" /> Revisar
            </Button>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
