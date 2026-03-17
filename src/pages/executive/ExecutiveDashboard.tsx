import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { InspectionStatusBadge } from '@/components/StatusBadge';
import type { Inspection } from '@/lib/types';
import { LogOut, FileSearch } from 'lucide-react';

export default function ExecutiveDashboard() {
  const { profile, signOut } = useAuth();
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('inspections')
        .select('*')
        .order('updated_at', { ascending: false });
      setInspections((data ?? []) as unknown as Inspection[]);
      setLoading(false);
    };
    fetch();
  }, []);

  const reviewQueue = inspections.filter((i) => ['submitted', 'in_review'].includes(i.status));
  const otherInspections = inspections.filter((i) => !['submitted', 'in_review'].includes(i.status));

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-card/80 backdrop-blur-sm">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <span className="text-sm font-bold text-primary-foreground">H</span>
            </div>
            <div>
              <h1 className="text-lg font-semibold">Revisión de Inspecciones</h1>
              <p className="text-xs text-muted-foreground">{profile?.full_name}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={signOut}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="container py-6 space-y-6">
        {loading ? (
          <div className="py-12 text-center text-muted-foreground">Cargando...</div>
        ) : (
          <>
            {reviewQueue.length > 0 && (
              <section>
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  Pendientes de Revisión ({reviewQueue.length})
                </h2>
                <div className="space-y-3">
                  {reviewQueue.map((insp) => (
                    <InspectionRow key={insp.id} inspection={insp} />
                  ))}
                </div>
              </section>
            )}
            {otherInspections.length > 0 && (
              <section>
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  Otras Inspecciones
                </h2>
                <div className="space-y-3">
                  {otherInspections.map((insp) => (
                    <InspectionRow key={insp.id} inspection={insp} />
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

function InspectionRow({ inspection: insp }: { inspection: Inspection }) {
  return (
    <Link to={`/executive/inspection/${insp.id}`}>
      <Card className="border-0 ring-1 ring-border/50 shadow-sm hover:shadow-md transition-shadow">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1 flex-1">
              <div className="flex items-center gap-3">
                <p className="font-medium">{insp.property_name ?? insp.property_id}</p>
                <InspectionStatusBadge status={insp.status} />
              </div>
              <p className="text-sm text-muted-foreground">{insp.address}</p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>{insp.market}</span>
                <span>{insp.typology}</span>
                <span>{insp.inspection_type}</span>
              </div>
            </div>
            <Button variant="outline" size="sm">
              <FileSearch className="mr-1 h-3.5 w-3.5" /> Revisar
            </Button>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
