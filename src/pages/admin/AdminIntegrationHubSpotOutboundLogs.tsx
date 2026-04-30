import { useCallback, useEffect, useState } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Link } from 'react-router-dom';
import { Search, RefreshCw, ExternalLink, RotateCcw, ArrowRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { retryHubspotSync } from '@/lib/hubspot-sync';
import {
  classifyOutboundFailure,
  retryClassLabel,
  type RetryClass,
} from '@/lib/hubspot-retry-classifier';

type LogRow = {
  id: string;
  inspection_id: string | null;
  external_reference_id: string | null;
  action: string;
  hubspot_object_type_id: string | null;
  hubspot_object_id: string | null;
  request_payload: any;
  response_status: number | null;
  response_body: any;
  status: string;
  error_message: string | null;
  triggered_by: string | null;
  event_time: string | null;
  created_at: string;
  retry_count: number | null;
  retry_attempts_json: any;
  retried_to_log_id: string | null;
  retried_from_log_id: string | null;
};

const RETRY_LIMIT = 5;

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  success: 'default',
  error: 'destructive',
  skipped: 'outline',
};

const STATUS_LABELS: Record<string, string> = {
  success: 'Éxito',
  error: 'Error',
  skipped: 'Omitido',
};

const ACTION_LABELS: Record<string, string> = {
  key_collection_date: 'Fecha recolección llaves',
  checkout_received: 'Checkout recibido',
};

function RetryClassBadge({ klass }: { klass: RetryClass }) {
  if (klass === 'not_failed') return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <Badge
      variant="outline"
      className={
        klass === 'retryable'
          ? 'border-amber-500/40 text-amber-700 dark:text-amber-400'
          : 'text-muted-foreground'
      }
    >
      {retryClassLabel(klass)}
    </Badge>
  );
}

export default function AdminIntegrationHubSpotOutboundLogs() {
  const { toast } = useToast();
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [retryFilter, setRetryFilter] = useState<'all' | 'retryable' | 'non_retryable'>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<LogRow | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from('hubspot_sync_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (statusFilter !== 'all') q = q.eq('status', statusFilter);

    const { data } = await q;
    setRows((data ?? []) as LogRow[]);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRetry(row: LogRow) {
    setRetryingId(row.id);
    const res = await retryHubspotSync(row.id);
    setRetryingId(null);
    if (res.ok) {
      const newId = (res.new_log_id as string | null) ?? null;
      toast({
        title: 'Reintento creado',
        description: newId ? `Nuevo log ${newId.slice(0, 8)} (${res.new_status ?? '—'})` : 'Reintento ejecutado.',
      });
      load();
    } else {
      const err = res.error as { message?: string; context?: { error?: string; reason?: string } } | undefined;
      const detail =
        err?.context?.reason ?? err?.context?.error ?? err?.message ?? 'No se pudo reintentar';
      toast({ title: 'Error al reintentar', description: detail, variant: 'destructive' });
    }
  }

  const filtered = rows.filter((r) => {
    const klass = classifyOutboundFailure(r);
    if (retryFilter === 'retryable' && klass !== 'retryable') return false;
    if (retryFilter === 'non_retryable' && klass !== 'non_retryable') return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      r.id.toLowerCase().includes(s) ||
      (r.inspection_id ?? '').toLowerCase().includes(s) ||
      (r.hubspot_object_id ?? '').toLowerCase().includes(s) ||
      (r.error_message ?? '').toLowerCase().includes(s)
    );
  });

  return (
    <AdminLayout>
      <TooltipProvider>
      <div className="p-6 max-w-7xl mx-auto space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">
              <Link to="/admin/integrations" className="hover:underline">Integraciones</Link> /{' '}
              <Link to="/admin/integrations/hubspot" className="hover:underline">HubSpot</Link> / Logs salientes
            </p>
            <h1 className="text-2xl font-semibold">Eventos salientes</h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Actualizar
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              <span className="text-xs uppercase text-muted-foreground self-center mr-1">Estado:</span>
              {['all', 'success', 'error', 'skipped'].map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={statusFilter === s ? 'default' : 'outline'}
                  onClick={() => setStatusFilter(s)}
                >
                  {s === 'all' ? 'Todos' : STATUS_LABELS[s] ?? s}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="text-xs uppercase text-muted-foreground self-center mr-1">Tipo:</span>
              {(['all', 'retryable', 'non_retryable'] as const).map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={retryFilter === s ? 'default' : 'outline'}
                  onClick={() => setRetryFilter(s)}
                >
                  {s === 'all' ? 'Todos' : s === 'retryable' ? 'Reintentables' : 'No reintentables'}
                </Button>
              ))}
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por inspection_id, hubspot_object_id, error…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-3">Creado</th>
                  <th className="text-left px-4 py-3">Acción</th>
                  <th className="text-left px-4 py-3">Inspección</th>
                  <th className="text-left px-4 py-3">Estado</th>
                  <th className="text-left px-4 py-3">Tipo</th>
                  <th className="text-left px-4 py-3">HTTP</th>
                  <th className="text-left px-4 py-3">Reintentos</th>
                  <th className="text-left px-4 py-3">Error</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const klass = classifyOutboundFailure(r);
                  const retryCount = r.retry_count ?? 0;
                  const overCap = retryCount >= RETRY_LIMIT;
                  const canRetry = klass === 'retryable' && !overCap;
                  return (
                    <tr key={r.id} className="border-t hover:bg-muted/30">
                      <td className="px-4 py-3 align-top whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                      <td className="px-4 py-3 align-top">
                        <code className="text-xs">{ACTION_LABELS[r.action] ?? r.action}</code>
                      </td>
                      <td className="px-4 py-3 align-top">
                        {r.inspection_id ? (
                          <Link to={`/admin/inspections/${r.inspection_id}`} className="text-primary hover:underline inline-flex items-center gap-1 text-xs">
                            ver <ExternalLink className="h-3 w-3" />
                          </Link>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <Badge variant={STATUS_VARIANTS[r.status] ?? 'outline'}>
                          {STATUS_LABELS[r.status] ?? r.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <RetryClassBadge klass={klass} />
                      </td>
                      <td className="px-4 py-3 align-top text-xs">{r.response_status ?? '—'}</td>
                      <td className="px-4 py-3 align-top text-xs">
                        {retryCount > 0 ? `${retryCount}/${RETRY_LIMIT}` : '—'}
                      </td>
                      <td className="px-4 py-3 align-top text-xs text-destructive">
                        <div className="max-w-[220px] truncate">{r.error_message ?? ''}</div>
                      </td>
                      <td className="px-4 py-3 align-top whitespace-nowrap space-x-2">
                        {r.status === 'error' && (
                          canRetry ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={retryingId === r.id}
                              onClick={() => handleRetry(r)}
                            >
                              <RotateCcw className={`mr-1 h-3 w-3 ${retryingId === r.id ? 'animate-spin' : ''}`} />
                              Reintentar
                            </Button>
                          ) : (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span>
                                  <Button size="sm" variant="outline" disabled>
                                    <RotateCcw className="mr-1 h-3 w-3" />
                                    Reintentar
                                  </Button>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                {overCap ? 'Límite de reintentos alcanzado' : 'Error no reintentable'}
                              </TooltipContent>
                            </Tooltip>
                          )
                        )}
                        <Button size="sm" variant="link" className="text-sm px-0 h-auto" onClick={() => setSelected(r)}>Detalles</Button>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && !loading && (
                  <tr><td colSpan={9} className="text-center py-8 text-muted-foreground text-sm">Sin eventos.</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="sm:max-w-2xl overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>Sync {selected.id.slice(0, 8)}</SheetTitle>
                <SheetDescription>
                  {ACTION_LABELS[selected.action] ?? selected.action} · {new Date(selected.created_at).toLocaleString()}
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-4 mt-4 text-sm">
                <div className="flex flex-wrap gap-2">
                  <Badge variant={STATUS_VARIANTS[selected.status] ?? 'outline'}>
                    {STATUS_LABELS[selected.status] ?? selected.status}
                  </Badge>
                  <RetryClassBadge klass={classifyOutboundFailure(selected)} />
                  {selected.response_status != null && (
                    <Badge variant="outline">HTTP {selected.response_status}</Badge>
                  )}
                  {selected.hubspot_object_type_id && (
                    <Badge variant="outline">type {selected.hubspot_object_type_id}</Badge>
                  )}
                  {selected.hubspot_object_id && (
                    <Badge variant="outline">id {selected.hubspot_object_id}</Badge>
                  )}
                </div>

                {(selected.retried_from_log_id || selected.retried_to_log_id) && (
                  <div className="rounded border bg-muted/40 p-3 space-y-1">
                    <h3 className="font-medium text-xs uppercase text-muted-foreground">Linaje de reintentos</h3>
                    {selected.retried_from_log_id && (
                      <div className="flex items-center gap-1 text-xs">
                        Reintento de
                        <code className="font-mono">{selected.retried_from_log_id.slice(0, 8)}</code>
                      </div>
                    )}
                    {selected.retried_to_log_id && (
                      <div className="flex items-center gap-1 text-xs">
                        Reintentado como
                        <ArrowRight className="h-3 w-3" />
                        <code className="font-mono">{selected.retried_to_log_id.slice(0, 8)}</code>
                      </div>
                    )}
                  </div>
                )}

                {Array.isArray(selected.retry_attempts_json) && selected.retry_attempts_json.length > 0 && (
                  <div>
                    <h3 className="font-medium mb-1">Historial de reintentos ({selected.retry_count ?? 0}/{RETRY_LIMIT})</h3>
                    <ul className="space-y-1 text-xs">
                      {selected.retry_attempts_json.map((a: any, i: number) => (
                        <li key={i} className="border-l-2 border-primary/40 pl-2">
                          <div>{a.attempted_at ? new Date(a.attempted_at).toLocaleString() : '—'} · <span className="font-medium">{a.outcome}</span></div>
                          {a.new_log_id && (
                            <div className="text-muted-foreground">→ log <code>{String(a.new_log_id).slice(0, 8)}</code> ({a.new_status ?? '—'})</div>
                          )}
                          {a.event_time_source && a.event_time_source !== 'log_row' && (
                            <div className="text-muted-foreground">event_time source: {a.event_time_source}</div>
                          )}
                          {a.error && <div className="text-destructive">{a.error}</div>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {selected.error_message && (
                  <div>
                    <h3 className="font-medium mb-1">Error</h3>
                    <pre className="text-xs bg-destructive/10 text-destructive p-2 rounded">{selected.error_message}</pre>
                  </div>
                )}

                {selected.event_time && (
                  <div>
                    <h3 className="font-medium mb-1">Event time</h3>
                    <pre className="text-xs bg-muted p-2 rounded">{new Date(selected.event_time).toISOString()}</pre>
                  </div>
                )}

                {selected.request_payload && (
                  <div>
                    <h3 className="font-medium mb-1">Payload enviado</h3>
                    <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-64">{JSON.stringify(selected.request_payload, null, 2)}</pre>
                  </div>
                )}

                {selected.response_body !== null && selected.response_body !== undefined && (
                  <div>
                    <h3 className="font-medium mb-1">Respuesta de HubSpot</h3>
                    <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-64">{typeof selected.response_body === 'string' ? selected.response_body : JSON.stringify(selected.response_body, null, 2)}</pre>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
      </TooltipProvider>
    </AdminLayout>
  );
}
