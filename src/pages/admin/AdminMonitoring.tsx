import { useQuery } from '@tanstack/react-query';
import AdminLayout from '@/components/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { monitoringEnabled, sendTestEvent } from '@/lib/monitoring';
import { Activity, AlertTriangle, CheckCircle2, ExternalLink, Gauge, ServerCrash, Send } from 'lucide-react';

const POSTHOG_APP = 'https://app.posthog.com';

interface HealthRow {
  status: string;
  detail: string | null;
  since: string;
  last_checked_at: string;
}

interface ClientErrorRow {
  id: string;
  created_at: string;
  error_kind: string;
  message: string | null;
  status_code: number | null;
  section_key: string | null;
  inspection_id: string | null;
}

interface SupabaseStatus {
  indicator: string;
  description: string;
}

function useHealthState() {
  return useQuery<HealthRow | null>({
    queryKey: ['monitoring', 'health-state'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_health_state')
        .select('status, detail, since, last_checked_at')
        .order('last_checked_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as HealthRow | null;
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}

function useClientErrors() {
  return useQuery<ClientErrorRow[]>({
    queryKey: ['monitoring', 'client-errors'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_error_log')
        .select('id, created_at, error_kind, message, status_code, section_key, inspection_id')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as ClientErrorRow[];
    },
    staleTime: 60_000,
  });
}

function useBackendStatusPage() {
  return useQuery<SupabaseStatus | null>({
    queryKey: ['monitoring', 'status-page'],
    queryFn: async () => {
      const res = await fetch('https://status.supabase.com/api/v2/status.json');
      if (!res.ok) throw new Error(`status.json ${res.status}`);
      const json = (await res.json()) as { status?: SupabaseStatus };
      return json.status ?? null;
    },
    staleTime: 5 * 60_000,
    retry: 0,
  });
}

function fmt(ts: string): string {
  return new Date(ts).toLocaleString('es-CL', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AdminMonitoring() {
  const health = useHealthState();
  const errors = useClientErrors();
  const statusPage = useBackendStatusPage();

  const healthy = health.data?.status === 'ok';

  // Group the last 50 client errors by kind — the quickest read on what is
  // failing most for real users right now.
  const byKind = (errors.data ?? []).reduce<Record<string, number>>((acc, e) => {
    acc[e.error_kind] = (acc[e.error_kind] ?? 0) + 1;
    return acc;
  }, {});
  const topKinds = Object.entries(byKind).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <AdminLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Monitoreo</h1>
          <p className="text-muted-foreground text-sm">
            Estado del backend, errores de clientes y rendimiento en producción.
          </p>
        </div>

        {/* Estado */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Backend Homie</CardDescription>
              <CardTitle className="text-base flex items-center gap-2">
                {health.isLoading ? (
                  <Skeleton className="h-5 w-24" />
                ) : healthy ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-[hsl(var(--status-good))]" /> Operativo
                  </>
                ) : (
                  <>
                    <ServerCrash className="h-4 w-4 text-destructive" /> {health.data?.status ?? 'sin datos'}
                  </>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-1">
              {health.data && (
                <>
                  <p>Último chequeo: {fmt(health.data.last_checked_at)}</p>
                  <p>Desde: {fmt(health.data.since)}</p>
                  {health.data.detail && <p className="text-destructive">{health.data.detail}</p>}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Plataforma (proveedor)</CardDescription>
              <CardTitle className="text-base flex items-center gap-2">
                {statusPage.isLoading ? (
                  <Skeleton className="h-5 w-24" />
                ) : statusPage.data?.indicator === 'none' ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-[hsl(var(--status-good))]" /> Sin incidentes
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-4 w-4 text-[hsl(var(--status-warning,38_92%_50%))]" />{' '}
                    {statusPage.data?.description ?? 'No disponible'}
                  </>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              {statusPage.data?.description ?? 'Estado publicado por el proveedor de infraestructura.'}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Telemetría PostHog</CardDescription>
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                {monitoringEnabled ? 'Activa' : 'Inactiva en este entorno'}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Web Vitals, errores y session replays se capturan solo en producción.
            </CardContent>
          </Card>
        </div>

        {/* Enlaces a PostHog */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Gauge className="h-4 w-4 text-primary" /> Rendimiento y sesiones
            </CardTitle>
            <CardDescription>
              Las métricas de Web Vitals y duración de operaciones viven en PostHog. Estos accesos abren
              las vistas relevantes.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <a href={`${POSTHOG_APP}/events`} target="_blank" rel="noreferrer">
                Eventos performance_operation <ExternalLink className="ml-2 h-3.5 w-3.5" />
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={`${POSTHOG_APP}/error_tracking`} target="_blank" rel="noreferrer">
                Excepciones <ExternalLink className="ml-2 h-3.5 w-3.5" />
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={`${POSTHOG_APP}/replay/recent`} target="_blank" rel="noreferrer">
                Session replays <ExternalLink className="ml-2 h-3.5 w-3.5" />
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={`${POSTHOG_APP}/web`} target="_blank" rel="noreferrer">
                Web Vitals <ExternalLink className="ml-2 h-3.5 w-3.5" />
              </a>
            </Button>
          </CardContent>
        </Card>

        {/* Errores de cliente */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Últimos errores de clientes</CardTitle>
            <CardDescription>Errores registrados por la app (subida de fotos, guardado, red).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {topKinds.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {topKinds.map(([kind, count]) => (
                  <Badge key={kind} variant="secondary" className="whitespace-nowrap">
                    {kind}: {count}
                  </Badge>
                ))}
              </div>
            )}

            {errors.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : (errors.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin errores registrados.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="py-2 text-left font-medium">Fecha</th>
                      <th className="py-2 text-left font-medium">Tipo</th>
                      <th className="py-2 text-left font-medium">HTTP</th>
                      <th className="py-2 text-left font-medium">Mensaje</th>
                      <th className="py-2 text-left font-medium">Inspección</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(errors.data ?? []).map((e) => (
                      <tr key={e.id} className="border-b border-border/50">
                        <td className="py-2 whitespace-nowrap text-muted-foreground">{fmt(e.created_at)}</td>
                        <td className="py-2 whitespace-nowrap">{e.error_kind}</td>
                        <td className="py-2 whitespace-nowrap">{e.status_code ?? '—'}</td>
                        <td className="py-2 max-w-[380px] truncate">{e.message ?? '—'}</td>
                        <td className="py-2 whitespace-nowrap">
                          {e.inspection_id ? (
                            <a
                              className="text-primary underline"
                              href={`/admin/inspections/${e.inspection_id}`}
                            >
                              ver
                            </a>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
