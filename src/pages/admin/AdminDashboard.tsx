import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/shared/ui';
import { Skeleton } from '@/components/ui/skeleton';
import AdminLayout from '@/components/AdminLayout';
import ExecutiveLoadChart from './dashboard/ExecutiveLoadChart';
import OwnerAgingPanel from './dashboard/OwnerAgingPanel';
import ExecutivePerformancePanel from './dashboard/ExecutivePerformancePanel';
import InspectorPerformancePanel from './dashboard/InspectorPerformancePanel';
import { KpiCard } from '@/shared/ui';
import { getEffectiveSnapshot } from '@/lib/inspection-utils';
import { bucketOf, computeInspectionKpis } from '@/lib/inspection-buckets';
import type { Inspection, Profile } from '@/lib/types';
import {
  Plus, User, CalendarClock, AlertTriangle,
  UserCheck, Clock, FileSearch, AlertCircle, Send, CheckCircle2,
  MessageSquareWarning, Hourglass,
} from 'lucide-react';

/**
 * Reduced inspection columns for the dashboard.
 * We omit heavyweight JSON columns (`property_snapshot_json`,
 * `generated_structure_json`) to keep the payload small — the dashboard
 * only needs scheduling overrides + identification fields + owner-feedback
 * status so KPIs can split the post-publish lifecycle correctly.
 */
const DASHBOARD_COLS =
  'id, property_id, property_name, address, status, inspector_id, executive_id, created_at, updated_at, scheduled_at, market, property_overrides_json, owner_feedback_status, owner_feedback_last_submitted_at, published_at, owner_url_generated_at, inspection_type';

async function fetchDashboardInspections(): Promise<Inspection[]> {
  const { data, error } = await supabase
    .from('inspections')
    .select(DASHBOARD_COLS)
    .order('updated_at', { ascending: false })
    .limit(300);
  if (error) throw error;
  return (data ?? []) as unknown as Inspection[];
}

async function fetchActiveProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, role')
    .eq('is_active', true);
  if (error) throw error;
  return (data ?? []) as unknown as Profile[];
}

export default function AdminDashboard() {
  const inspQuery = useQuery({
    queryKey: ['admin', 'dashboard', 'inspections'],
    queryFn: fetchDashboardInspections,
    staleTime: 30_000,
  });
  const profilesQuery = useQuery({
    queryKey: ['admin', 'dashboard', 'active-profiles'],
    queryFn: fetchActiveProfiles,
    staleTime: 5 * 60_000,
  });

  const loading = inspQuery.isLoading || profilesQuery.isLoading;
  const inspections = inspQuery.data ?? [];
  const profiles = profilesQuery.data ?? [];

  const profileMap = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);

  // KPI counts (single pass) — same buckets as AdminInspections / ExecutiveReviewQueue.
  const kpis = useMemo(() => computeInspectionKpis(inspections), [inspections]);

  // Pending workload by inspector / executive.
  const { pendingByInspector, pendingByExecutive } = useMemo(() => {
    const byInsp = new Map<string, number>();
    const byExec = new Map<string, number>();
    for (const i of inspections) {
      if (i.inspector_id && ['assigned', 'in_progress'].includes(i.status)) {
        byInsp.set(i.inspector_id, (byInsp.get(i.inspector_id) ?? 0) + 1);
      }
      if (i.executive_id && ['submitted', 'in_review'].includes(i.status)) {
        byExec.set(i.executive_id, (byExec.get(i.executive_id) ?? 0) + 1);
      }
    }
    return { pendingByInspector: byInsp, pendingByExecutive: byExec };
  }, [inspections]);

  // Upcoming scheduled (next 5).
  const upcoming = useMemo(() => {
    const now = Date.now();
    const withDate = inspections
      .map((i) => {
        const snap = getEffectiveSnapshot(i);
        const fecha = snap?.fecha_recoleccion_llaves as string | undefined;
        if (!fecha) return null;
        const hora = (snap?.hora_recoleccion_llaves as string) || '00:00';
        const dt = new Date(`${fecha}T${hora}`).getTime();
        if (isNaN(dt) || dt < now) return null;
        return { insp: i, dt };
      })
      .filter((x): x is { insp: Inspection; dt: number } => x !== null)
      .sort((a, b) => a.dt - b.dt)
      .slice(0, 5);
    return withDate.map((x) => x.insp);
  }, [inspections]);

  // Unassigned (top 5) — same definition as KPI bucket 0.
  const unassigned = useMemo(
    () => inspections.filter((i) => bucketOf(i) === 0).slice(0, 5),
    [inspections],
  );

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
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        ) : (
          <>
            {/* KPI Cards — aligned with AdminInspections & ExecutiveReviewQueue.
                After publishing, the lifecycle splits in 3 to reflect the
                owner-feedback loop (esperando ↔ requiere acción ↔ aceptada). */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
              <Link to="/admin/inspections?bucket=unassigned">
                <KpiCard
                  label="Sin asignar" value={kpis.unassigned}
                  icon={<UserCheck className="h-5 w-5 text-status-bad" />} accent="red"
                  tooltip="Inspecciones creadas que aún no tienen inspector asignado."
                />
              </Link>
              <Link to="/admin/inspections?status=in_progress">
                <KpiCard
                  label="En espera de Hallazgos" value={kpis.inProgress}
                  icon={<Clock className="h-5 w-5 text-primary" />} accent="blue"
                  tooltip="El inspector ya inició la captura en sitio."
                />
              </Link>
              <Link to="/admin/inspections?status=submitted">
                <KpiCard
                  label="En gestión de cotización" value={kpis.forReview}
                  icon={<FileSearch className="h-5 w-5 text-primary" />} accent="blue"
                  tooltip="Enviadas por el inspector y esperando revisión del ejecutivo."
                />
              </Link>
              <Link to="/admin/inspections?status=approved">
                <KpiCard
                  label="Para publicar" value={kpis.toPublish}
                  icon={<Send className="h-5 w-5 text-primary" />} accent="blue"
                  tooltip="Aprobadas internamente. Falta enviarlas al propietario."
                />
              </Link>
              <Link to="/admin/inspections?bucket=waiting_owner">
                <KpiCard
                  label="En gestión de aprobación" value={kpis.waitingOwner}
                  icon={<Hourglass className="h-5 w-5 text-primary" />} accent="blue"
                  tooltip="Publicadas y enviadas al propietario. Aguardando su respuesta."
                />
              </Link>
              <Link to="/admin/inspections?bucket=owner_feedback">
                <KpiCard
                  label="Propietario pidió cambios" value={kpis.ownerFeedback}
                  icon={<MessageSquareWarning className="h-5 w-5 text-status-bad" />} accent="red"
                  tooltip="El propietario solicitó cambios. Requiere acción del ejecutivo."
                />
              </Link>
              <Link to="/admin/inspections?bucket=accepted">
                <KpiCard
                  label="Aprobados" value={kpis.accepted}
                  icon={<CheckCircle2 className="h-5 w-5 text-accent" />} accent="green"
                  tooltip="El propietario aceptó la cotización. Ciclo cerrado."
                />
              </Link>
            </div>
            <ExecutiveLoadChart inspections={inspections} profileMap={profileMap} />
            <OwnerAgingPanel inspections={inspections} profileMap={profileMap} />
            <ExecutivePerformancePanel />
            <InspectorPerformancePanel />


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
                        <Link
                          key={id}
                          to={`/admin/inspections?inspector=${id}`}
                          className="flex items-center justify-between py-1 px-2 -mx-2 rounded-md hover:bg-muted/50 transition-colors"
                        >
                          <span className="text-sm truncate">{profileMap.get(id)?.full_name ?? 'Desconocido'}</span>
                          <span className="text-sm font-semibold bg-status-regular-bg text-status-regular px-2 py-0.5 rounded-full">{count}</span>
                        </Link>
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
                        <Link
                          key={id}
                          to={`/admin/inspections?executive=${id}`}
                          className="flex items-center justify-between py-1 px-2 -mx-2 rounded-md hover:bg-muted/50 transition-colors"
                        >
                          <span className="text-sm truncate">{profileMap.get(id)?.full_name ?? 'Desconocido'}</span>
                          <span className="text-sm font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full">{count}</span>
                        </Link>
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
                    unassigned.map((insp) => (
                      <Link key={insp.id} to={`/admin/inspections/${insp.id}`} className="block py-1 hover:bg-muted/30 rounded px-1 -mx-1">
                        <p className="text-sm font-medium truncate">{insp.property_name ?? insp.property_id}</p>
                        <p className="text-tiny text-muted-foreground truncate">{insp.address}</p>
                      </Link>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Upcoming + Recent in two columns */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Upcoming Schedule */}
              <Card className="border-0 ring-1 ring-border shadow-sm">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <CalendarClock className="h-4 w-4 text-muted-foreground" /> Próximas coordinadas
                    </CardTitle>
                    <Link to="/admin/schedule"><Button variant="ghost" size="sm">Ver calendario</Button></Link>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {upcoming.length === 0 ? (
                    <p className="text-caption text-muted-foreground">Sin inspecciones próximas</p>
                  ) : (
                    upcoming.map((insp) => (
                      <Link key={insp.id} to={`/admin/inspections/${insp.id}`} className="block py-1.5 hover:bg-muted/30 rounded px-1 -mx-1">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium truncate">{insp.property_name ?? insp.property_id}</p>
                          <StatusBadge inspection={insp} />
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
                  {inspections.slice(0, 5).map((insp) => (
                    <Link key={insp.id} to={`/admin/inspections/${insp.id}`} className="block py-1.5 hover:bg-muted/30 rounded px-1 -mx-1">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{insp.property_name ?? insp.property_id}</p>
                          <p className="text-tiny text-muted-foreground truncate">{insp.address}</p>
                        </div>
                        <StatusBadge inspection={insp} />
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
