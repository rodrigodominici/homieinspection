import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { InspectionStatusBadge } from '@/components/StatusBadge';
import { Skeleton } from '@/components/ui/skeleton';
import AdminLayout from '@/components/AdminLayout';
import type { Inspection } from '@/lib/types';
import { ClipboardList, Clock, FileSearch, AlertCircle, Plus } from 'lucide-react';

export default function AdminDashboard() {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('inspections')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => {
        setInspections((data ?? []) as unknown as Inspection[]);
        setLoading(false);
      });
  }, []);

  const stats = {
    total: inspections.length,
    pendingAssignment: inspections.filter((i) => i.status === 'pending_assignment').length,
    inProgress: inspections.filter((i) => ['in_progress', 'assigned'].includes(i.status)).length,
    submitted: inspections.filter((i) => ['submitted', 'in_review'].includes(i.status)).length,
    completed: inspections.filter((i) => ['approved', 'published', 'sent'].includes(i.status)).length,
  };

  return (
    <AdminLayout>
      <div className="p-6 space-y-6 max-w-6xl">
        <div className="flex items-center justify-between">
          <h1 className="text-h2">Dashboard</h1>
          <Link to="/admin/inspections?tab=create">
            <Button><Plus className="mr-2 h-4 w-4" /> Nueva Inspección</Button>
          </Link>
        </div>

        {/* Stats */}
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard icon={AlertCircle} label="Sin Asignar" value={stats.pendingAssignment} variant="danger" />
            <StatCard icon={Clock} label="En Curso" value={stats.inProgress} variant="warning" />
            <StatCard icon={FileSearch} label="En Revisión" value={stats.submitted} variant="primary" />
            <StatCard icon={ClipboardList} label="Completadas" value={stats.completed} variant="success" />
          </div>
        )}

        {/* Recent inspections */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-body-lg text-muted-foreground">Inspecciones Recientes</h2>
            <Link to="/admin/inspections">
              <Button variant="ghost" size="sm">Ver todas</Button>
            </Link>
          </div>

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
          ) : inspections.length === 0 ? (
            <Card className="border-0 ring-1 ring-border shadow-sm">
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">No hay inspecciones aún</p>
                <Link to="/admin/inspections?tab=create">
                  <Button className="mt-4"><Plus className="mr-2 h-4 w-4" /> Crear Primera Inspección</Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {inspections.slice(0, 5).map((insp) => (
                <Card key={insp.id} className="border-0 ring-1 ring-border shadow-sm hover:shadow-md transition-shadow">
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <p className="font-medium">{insp.property_name ?? insp.property_id}</p>
                        <p className="text-caption text-muted-foreground">{insp.address}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <InspectionStatusBadge status={insp.status} />
                          <span className="text-tiny text-muted-foreground">{insp.inspection_type} · {insp.market}</span>
                        </div>
                      </div>
                      <Link to="/admin/inspections">
                        <Button variant="outline" size="sm">Ver</Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

function StatCard({ icon: Icon, label, value, variant }: {
  icon: React.ElementType; label: string; value: number;
  variant: 'danger' | 'warning' | 'primary' | 'success';
}) {
  const variantClasses = {
    danger: 'bg-status-bad-bg text-status-bad',
    warning: 'bg-status-regular-bg text-status-regular',
    primary: 'bg-primary/10 text-primary',
    success: 'bg-status-good-bg text-status-good',
  };

  return (
    <Card className="border-0 ring-1 ring-border shadow-sm">
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className={`rounded-xl p-2.5 ${variantClasses[variant]}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-caption text-muted-foreground">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
