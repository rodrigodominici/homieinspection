import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { InspectionStatusBadge } from '@/components/StatusBadge';
import { Skeleton } from '@/components/ui/skeleton';
import AdminLayout from '@/components/AdminLayout';
import { getEffectiveSnapshot } from '@/lib/inspection-utils';
import type { Inspection, Profile } from '@/lib/types';
import { ClipboardList, Clock, FileSearch, AlertCircle, Plus, User, CalendarClock, AlertTriangle } from 'lucide-react';

export default function AdminDashboard() {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const [inspRes, profilesRes] = await Promise.all([
        supabase.from('inspections').select('*').order('created_at', { ascending: false }),
        supabase.from('profiles').select('*').eq('is_active', true),
      ]);
      setInspections((inspRes.data ?? []) as unknown as Inspection[]);
      setProfiles((profilesRes.data ?? []) as unknown as Profile[]);
      setLoading(false);
    };
    fetch();
  }, []);

  const profileMap = new Map(profiles.map(p => [p.id, p]));

  const stats = {
    total: inspections.length,
    pendingAssignment: inspections.filter(i => i.status === 'pending_assignment' || !i.inspector_id || !i.executive_id).length,
    inProgress: inspections.filter(i => ['in_progress', 'assigned'].includes(i.status)).length,
    submitted: inspections.filter(i => ['submitted', 'in_review'].includes(i.status)).length,
    approved: inspections.filter(i => ['approved', 'published', 'sent'].includes(i.status)).length,
  };

  // Pending by inspector
  const pendingByInspector = new Map<string, number>();
  inspections.filter(i => ['assigned', 'in_progress', 'needs_changes'].includes(i.status) && i.inspector_id).forEach(i => {
    pendingByInspector.set(i.inspector_id!, (pendingByInspector.get(i.inspector_id!) ?? 0) + 1);
  });

  // Pending by executive
  const pendingByExecutive = new Map<string, number>();
  inspections.filter(i => ['submitted', 'in_review'].includes(i.status) && i.executive_id).forEach(i => {
    pendingByExecutive.set(i.executive_id!, (pendingByExecutive.get(i.executive_id!) ?? 0) + 1);
  });

  // Upcoming scheduled
  const now = new Date();
  const upcoming = inspections
    .filter(i => {
      const snap = getEffectiveSnapshot(i);
      const fecha = snap?.fecha_recoleccion_llaves as string | undefined;
      if (!fecha) return false;
      const dt = new Date(`${fecha}T${(snap?.hora_recoleccion_llaves as string) || '00:00'}`);
      return !isNaN(dt.getTime()) && dt >= now;
    })
    .sort((a, b) => {
      const snapA = getEffectiveSnapshot(a);
      const snapB = getEffectiveSnapshot(b);
      const dA = new Date(snapA?.fecha_recoleccion_llaves as string).getTime();
      const dB = new Date(snapB?.fecha_recoleccion_llaves as string).getTime();
      return dA - dB;
    })
    .slice(0, 5);

  // Unassigned
  const unassigned = inspections.filter(i => !i.inspector_id || !i.executive_id).slice(0, 5);

  return (
    <AdminLayout>
      <div className="p-6 space-y-6 max-w-7xl">
        <div className="flex items-center justify-between">
          <h1 className="text-h2">Dashboard</h1>
          <Link to="/admin/inspections?tab=create">
            <Button><Plus className="mr-2 h-4 w-4" /> Nueva Inspección</Button>
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <StatCard icon={ClipboardList} label="Total" value={stats.total} variant="primary" />
              <StatCard icon={AlertCircle} label="Sin Asignar" value={stats.pendingAssignment} variant="danger" />
              <StatCard icon={Clock} label="En Curso" value={stats.inProgress} variant="warning" />
              <StatCard icon={FileSearch} label="En Revisión" value={stats.submitted} variant="primary" />
              <StatCard icon={ClipboardList} label="Aprobadas" value={stats.approved} variant="success" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Pending by Inspector */}
              <Card className="border-0 ring-1 ring-border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" /> Pendientes por Inspector
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {pendingByInspector.size === 0 ? (
                    <p className="text-caption text-muted-foreground">Sin inspecciones pendientes</p>
                  ) : (
                    [...pendingByInspector.entries()]
                      .sort((a, b) => b[1] - a[1])
                      .map(([id, count]) => (
                        <div key={id} className="flex items-center justify-between py-1">
                          <span className="text-sm truncate">{profileMap.get(id)?.full_name ?? 'Desconocido'}</span>
                          <span className="text-sm font-semibold bg-status-regular-bg text-status-regular px-2 py-0.5 rounded-full">{count}</span>
                        </div>
                      ))
                  )}
                </CardContent>
              </Card>

              {/* Pending by Executive */}
              <Card className="border-0 ring-1 ring-border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" /> Por Revisar por Ejecutivo
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {pendingByExecutive.size === 0 ? (
                    <p className="text-caption text-muted-foreground">Sin revisiones pendientes</p>
                  ) : (
                    [...pendingByExecutive.entries()]
                      .sort((a, b) => b[1] - a[1])
                      .map(([id, count]) => (
                        <div key={id} className="flex items-center justify-between py-1">
                          <span className="text-sm truncate">{profileMap.get(id)?.full_name ?? 'Desconocido'}</span>
                          <span className="text-sm font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full">{count}</span>
                        </div>
                      ))
                  )}
                </CardContent>
              </Card>

              {/* Unassigned Alerts */}
              <Card className="border-0 ring-1 ring-border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-status-bad" /> Sin Asignar
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {unassigned.length === 0 ? (
                    <p className="text-caption text-muted-foreground">Todo asignado ✓</p>
                  ) : (
                    unassigned.map(insp => (
                      <Link key={insp.id} to={`/admin/inspections/${insp.id}`} className="block py-1 hover:bg-muted/30 rounded px-1 -mx-1">
                        <p className="text-sm font-medium truncate">{insp.property_name ?? insp.property_id}</p>
                        <p className="text-tiny text-muted-foreground truncate">{insp.address}</p>
                      </Link>
                    ))
                  )}
                </CardContent>
              </Card>

              {/* Missing Return Key Alert */}
              {missingReturnKey.length > 0 && (
                <Card className="border-0 ring-1 ring-status-regular/30 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Key className="h-4 w-4 text-status-regular" /> Sin Devolución de Llave ({missingReturnKey.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {missingReturnKey.slice(0, 5).map(insp => (
                      <Link key={insp.id} to={`/admin/inspections/${insp.id}`} className="block py-1 hover:bg-muted/30 rounded px-1 -mx-1">
                        <p className="text-sm font-medium truncate">{insp.property_name ?? insp.property_id}</p>
                        <p className="text-tiny text-muted-foreground truncate">{insp.address}</p>
                      </Link>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Upcoming + Recent in two columns */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Upcoming Schedule */}
              <Card className="border-0 ring-1 ring-border shadow-sm">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <CalendarClock className="h-4 w-4 text-muted-foreground" /> Próximas Programadas
                    </CardTitle>
                    <Link to="/admin/schedule"><Button variant="ghost" size="sm">Ver calendario</Button></Link>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {upcoming.length === 0 ? (
                    <p className="text-caption text-muted-foreground">Sin inspecciones próximas</p>
                  ) : (
                    upcoming.map(insp => (
                      <Link key={insp.id} to={`/admin/inspections/${insp.id}`} className="block py-1.5 hover:bg-muted/30 rounded px-1 -mx-1">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium truncate">{insp.property_name ?? insp.property_id}</p>
                          <InspectionStatusBadge status={insp.status} />
                        </div>
                      </Link>
                    ))
                  )}
                </CardContent>
              </Card>

              {/* Recent Inspections */}
              <Card className="border-0 ring-1 ring-border shadow-sm">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">Inspecciones Recientes</CardTitle>
                    <Link to="/admin/inspections"><Button variant="ghost" size="sm">Ver todas</Button></Link>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {inspections.slice(0, 5).map(insp => (
                    <Link key={insp.id} to={`/admin/inspections/${insp.id}`} className="block py-1.5 hover:bg-muted/30 rounded px-1 -mx-1">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{insp.property_name ?? insp.property_id}</p>
                          <p className="text-tiny text-muted-foreground truncate">{insp.address}</p>
                        </div>
                        <InspectionStatusBadge status={insp.status} />
                      </div>
                    </Link>
                  ))}
                </CardContent>
              </Card>
            </div>
          </>
        )}
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
