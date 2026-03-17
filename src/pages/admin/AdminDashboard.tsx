import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { InspectionStatusBadge } from '@/components/StatusBadge';
import type { Inspection } from '@/lib/types';
import { Plus, LogOut, ClipboardList, FileSearch, Clock } from 'lucide-react';

export default function AdminDashboard() {
  const { profile, signOut } = useAuth();
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('inspections')
        .select('*')
        .order('created_at', { ascending: false });
      setInspections((data ?? []) as unknown as Inspection[]);
      setLoading(false);
    };
    fetch();
  }, []);

  const stats = {
    total: inspections.length,
    pending: inspections.filter((i) => ['pending', 'assigned'].includes(i.status)).length,
    inProgress: inspections.filter((i) => ['in_progress', 'submitted', 'in_review'].includes(i.status)).length,
    completed: inspections.filter((i) => ['approved', 'published', 'sent'].includes(i.status)).length,
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-card/80 backdrop-blur-sm">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <span className="text-sm font-bold text-primary-foreground">H</span>
            </div>
            <div>
              <h1 className="text-lg font-semibold">Homie Inspection</h1>
              <p className="text-xs text-muted-foreground">Admin Panel</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{profile?.full_name}</span>
            <Button variant="ghost" size="icon" onClick={signOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-0 ring-1 ring-border/50 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2"><ClipboardList className="h-5 w-5 text-primary" /></div>
                <div>
                  <p className="text-2xl font-bold">{stats.total}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 ring-1 ring-border/50 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-status-regular-bg p-2"><Clock className="h-5 w-5 text-status-regular" /></div>
                <div>
                  <p className="text-2xl font-bold">{stats.pending}</p>
                  <p className="text-xs text-muted-foreground">Pendientes</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 ring-1 ring-border/50 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-status-regular-bg p-2"><FileSearch className="h-5 w-5 text-status-regular" /></div>
                <div>
                  <p className="text-2xl font-bold">{stats.inProgress}</p>
                  <p className="text-xs text-muted-foreground">En Curso</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 ring-1 ring-border/50 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-status-good-bg p-2"><ClipboardList className="h-5 w-5 text-status-good" /></div>
                <div>
                  <p className="text-2xl font-bold">{stats.completed}</p>
                  <p className="text-xs text-muted-foreground">Completadas</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Inspecciones</h2>
          <Link to="/admin/create">
            <Button><Plus className="mr-2 h-4 w-4" /> Nueva Inspección</Button>
          </Link>
        </div>

        {/* List */}
        {loading ? (
          <div className="py-12 text-center text-muted-foreground">Cargando...</div>
        ) : inspections.length === 0 ? (
          <Card className="border-0 ring-1 ring-border/50">
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">No hay inspecciones aún</p>
              <Link to="/admin/create">
                <Button className="mt-4"><Plus className="mr-2 h-4 w-4" /> Crear Primera Inspección</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {inspections.map((insp) => (
              <Card key={insp.id} className="border-0 ring-1 ring-border/50 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="font-medium">{insp.property_name ?? insp.property_id}</p>
                      <p className="text-sm text-muted-foreground">{insp.address}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <InspectionStatusBadge status={insp.status} />
                        <span className="text-xs text-muted-foreground">{insp.inspection_type}</span>
                        <span className="text-xs text-muted-foreground">{insp.market}</span>
                      </div>
                    </div>
                    <Link to={`/admin/inspection/${insp.id}`}>
                      <Button variant="outline" size="sm">Ver</Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
