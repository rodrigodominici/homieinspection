import { useCallback, useEffect, useState } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Link } from 'react-router-dom';
import { Search, RefreshCw, AlertTriangle, RotateCcw, ExternalLink } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

type EventRow = {
  id: string;
  source: string;
  event_type: string | null;
  external_event_id: string | null;
  external_object_id: string | null;
  hubspot_property_id: string | null;
  processing_status: string;
  failure_reason: string | null;
  error_message: string | null;
  inspection_id: string | null;
  received_at: string;
  processed_at: string | null;
  processing_duration_ms: number | null;
  processing_step: string | null;
  payload_json: any;
  normalized_payload_json: any;
  duplicate_count: number;
  duplicate_attempts_json: any;
  retry_count: number;
  retry_attempts_json: any;
  recovery_count: number;
};

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  completed: 'default',
  received: 'secondary',
  processing: 'secondary',
  failed: 'destructive',
  ignored: 'outline',
  pending: 'outline',
};

const FAILURE_LABELS: Record<string, string> = {
  payload_validation: 'Payload inválido',
  normalization: 'Normalización',
  structure_generation: 'Generación de estructura',
  inspection_creation: 'Creación inspección',
  inspection_insert: 'Inserción de inspección',
  sections_insert: 'Inserción de secciones',
  field_values_insert: 'Inserción de campos',
  event_update: 'Actualización del evento',
  assignment_resolution: 'Asignación',
  unknown: 'Desconocido',
};

const NON_RETRYABLE_REASONS = new Set(['payload_validation', 'structure_generation']);
const NON_RETRYABLE_ERROR_PATTERNS = [
  'violates check constraint',
  'data-modifying statement',
  'column does not exist',
  'syntax error',
  'invalid input syntax',
];

function isNonRetryable(reason: string | null, msg: string | null): boolean {
  if (reason && NON_RETRYABLE_REASONS.has(reason)) return true;
  if (!msg) return false;
  const lower = msg.toLowerCase();
  return NON_RETRYABLE_ERROR_PATTERNS.some((p) => lower.includes(p));
}

const RETRY_LIMIT = 5;

export default function AdminIntegrationHubSpotLogs() {
  const [rows, setRows] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<EventRow | null>(null);
  const [recovering, setRecovering] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from('inspection_source_events')
      .select('*')
      .order('received_at', { ascending: false })
      .limit(200);

    if (statusFilter === 'stalled') {
      const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      q = q.in('processing_status', ['received', 'processing']).lt('received_at', cutoff);
    } else if (statusFilter !== 'all') {
      q = q.eq('processing_status', statusFilter);
    }

    const { data } = await q;
    setRows((data ?? []) as EventRow[]);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = rows.filter((r) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      r.id.toLowerCase().includes(s) ||
      (r.external_event_id ?? '').toLowerCase().includes(s) ||
      (r.external_object_id ?? '').toLowerCase().includes(s) ||
      (r.hubspot_property_id ?? '').toLowerCase().includes(s) ||
      (r.payload_json?.data?.property_id ?? '').toLowerCase().includes(s)
    );
  });

  function hasPartialAssignment(r: EventRow): boolean {
    const a = r.normalized_payload_json?.__assignment__;
    if (!a) return false;
    return a.inspector?.resolved_via === 'unresolved' || a.executive?.resolved_via === 'unresolved';
  }

  async function handleRetry(row: EventRow) {
    const { data, error } = await supabase.functions.invoke('retry-source-event', {
      body: { event_id: row.id },
    });
    if (error) {
      toast({ title: 'Error al reintentar', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Resultado', description: data?.status ?? 'sin estado' });
    load();
    if (selected?.id === row.id) {
      const { data: refreshed } = await supabase
        .from('inspection_source_events')
        .select('*')
        .eq('id', row.id)
        .single();
      if (refreshed) setSelected(refreshed as EventRow);
    }
  }

  async function handleRecoverAll() {
    setRecovering(true);
    const { data, error } = await supabase.functions.invoke('recover-stalled-events', { body: {} });
    setRecovering(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Recuperados', description: `${data?.recovered ?? 0} eventos procesados` });
    load();
  }

  return (
    <AdminLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">
              <Link to="/admin/integrations" className="hover:underline">Integraciones</Link> /{' '}
              <Link to="/admin/integrations/hubspot" className="hover:underline">HubSpot</Link> / Logs
            </p>
            <h1 className="text-2xl font-semibold">Eventos entrantes</h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Actualizar
            </Button>
            <Button variant="outline" size="sm" onClick={handleRecoverAll} disabled={recovering}>
              <AlertTriangle className="mr-2 h-4 w-4" />
              Reprocesar atascados
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              {['all', 'received', 'processing', 'completed', 'failed', 'ignored', 'stalled'].map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={statusFilter === s ? 'default' : 'outline'}
                  onClick={() => setStatusFilter(s)}
                >
                  {s === 'all' ? 'Todos' : s === 'stalled' ? 'Atascados' : s}
                </Button>
              ))}
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por external_event_id, external_object_id, property_id…"
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
                  <th className="text-left px-4 py-3">Recibido</th>
                  <th className="text-left px-4 py-3">Tipo</th>
                  <th className="text-left px-4 py-3">External event id</th>
                  <th className="text-left px-4 py-3">Property</th>
                  <th className="text-left px-4 py-3">Estado</th>
                  <th className="text-left px-4 py-3">Inspección</th>
                  <th className="text-left px-4 py-3">Duración</th>
                  <th className="text-left px-4 py-3">Error</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-muted/30">
                    <td className="px-4 py-3 align-top whitespace-nowrap">{new Date(r.received_at).toLocaleString()}</td>
                    <td className="px-4 py-3 align-top">
                      <code className="text-xs">{r.event_type ?? '—'}</code>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <code className="text-xs truncate max-w-[160px] inline-block">
                        {r.external_event_id?.slice(0, 24) ?? '—'}
                      </code>
                      {r.duplicate_count > 0 && (
                        <Badge variant="outline" className="ml-1">×{r.duplicate_count + 1}</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <code className="text-xs">
                        {r.payload_json?.data?.property_id ?? r.external_object_id ?? '—'}
                      </code>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-col gap-1 items-start">
                        <Badge variant={STATUS_VARIANTS[r.processing_status] ?? 'outline'}>
                          {r.processing_status}
                        </Badge>
                        {hasPartialAssignment(r) && (
                          <span className="text-xs text-muted-foreground">Asignación parcial</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      {r.inspection_id ? (
                        <Link to={`/admin/inspections/${r.inspection_id}`} className="text-primary hover:underline inline-flex items-center gap-1 text-xs">
                          ver <ExternalLink className="h-3 w-3" />
                        </Link>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 align-top text-xs">
                      {r.processing_duration_ms != null ? `${r.processing_duration_ms} ms` : '—'}
                    </td>
                    <td className="px-4 py-3 align-top text-xs text-destructive">
                      {(r.failure_reason || r.error_message || r.processing_step) ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="max-w-[200px] truncate cursor-help">
                                {r.failure_reason && (
                                  <div className="font-medium truncate">{FAILURE_LABELS[r.failure_reason] ?? r.failure_reason}</div>
                                )}
                                {r.error_message && (
                                  <div className="truncate text-[11px] opacity-90">{r.error_message}</div>
                                )}
                                {r.processing_step && (
                                  <div className="text-[11px] text-muted-foreground truncate">paso: <code>{r.processing_step}</code></div>
                                )}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-md whitespace-pre-wrap break-words text-xs">
                              {r.failure_reason && (
                                <div className="font-medium">{FAILURE_LABELS[r.failure_reason] ?? r.failure_reason}</div>
                              )}
                              {r.error_message && <div className="opacity-90">{r.error_message}</div>}
                              {r.processing_step && <div className="text-muted-foreground">paso: {r.processing_step}</div>}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 align-top whitespace-nowrap">
                      <Button size="sm" variant="link" className="text-sm px-0 h-auto" onClick={() => setSelected(r)}>Detalles</Button>
                      {r.processing_status === 'failed' && (
                        <RetryButton row={r} onRetry={handleRetry} />
                      )}
                    </td>
                  </tr>
                ))}
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
                <SheetTitle>Evento {selected.id.slice(0, 8)}</SheetTitle>
                <SheetDescription>
                  {selected.event_type} · {new Date(selected.received_at).toLocaleString()}
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-4 mt-4 text-sm">
                <div className="flex flex-wrap gap-2">
                  <Badge variant={STATUS_VARIANTS[selected.processing_status] ?? 'outline'}>
                    {selected.processing_status}
                  </Badge>
                  {selected.failure_reason && (
                    <Badge variant="destructive">{FAILURE_LABELS[selected.failure_reason] ?? selected.failure_reason}</Badge>
                  )}
                  {selected.duplicate_count > 0 && (
                    <Badge variant="outline">duplicados: {selected.duplicate_count}</Badge>
                  )}
                  {selected.retry_count > 0 && (
                    <Badge variant="outline">retries: {selected.retry_count}/{RETRY_LIMIT}</Badge>
                  )}
                  {selected.recovery_count > 0 && (
                    <Badge variant="outline">recovered: {selected.recovery_count}</Badge>
                  )}
                  {selected.processing_step && (
                    <Badge variant="outline">paso: {selected.processing_step}</Badge>
                  )}
                </div>

                {selected.error_message && (
                  <div>
                    <h3 className="font-medium mb-1">Error</h3>
                    <pre className="text-xs bg-destructive/10 text-destructive p-2 rounded">{selected.error_message}</pre>
                  </div>
                )}

                {selected.processing_status === 'failed' && (
                  <RetryButton row={selected} onRetry={handleRetry} expanded />
                )}

                <div>
                  <h3 className="font-medium mb-1">Payload recibido</h3>
                  <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-64">{JSON.stringify(selected.payload_json, null, 2)}</pre>
                </div>

                {selected.normalized_payload_json?.__assignment__ && (
                  <AssignmentPanel assignment={selected.normalized_payload_json.__assignment__} />
                )}

                {selected.normalized_payload_json && (
                  <div>
                    <h3 className="font-medium mb-1">Payload normalizado</h3>
                    <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-64">{JSON.stringify(selected.normalized_payload_json, null, 2)}</pre>
                  </div>
                )}

                {Array.isArray(selected.duplicate_attempts_json) && selected.duplicate_attempts_json.length > 0 && (
                  <div>
                    <h3 className="font-medium mb-1">Reintentos del mismo evento ({selected.duplicate_attempts_json.length})</h3>
                    <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-48">{JSON.stringify(selected.duplicate_attempts_json, null, 2)}</pre>
                  </div>
                )}

                {Array.isArray(selected.retry_attempts_json) && selected.retry_attempts_json.length > 0 && (
                  <div>
                    <h3 className="font-medium mb-1">Historial de retries</h3>
                    <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-48">{JSON.stringify(selected.retry_attempts_json, null, 2)}</pre>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </AdminLayout>
  );
}

function RetryButton({ row, onRetry, expanded }: { row: EventRow; onRetry: (r: EventRow) => void; expanded?: boolean }) {
  const blockedDeterministic = isNonRetryable(row.failure_reason, row.error_message);
  const blockedLimit = (row.retry_count ?? 0) >= RETRY_LIMIT;
  const disabled = blockedDeterministic || blockedLimit;
  const tip = blockedDeterministic
    ? 'No se puede reintentar: el error es determinista (payload o estructura inválida). Corrige en el origen o redeploy.'
    : blockedLimit
    ? `Límite alcanzado (${RETRY_LIMIT}).`
    : 'Reintentar creación';

  const btn = (
    <Button
      size="sm"
      variant={expanded ? 'default' : 'ghost'}
      disabled={disabled}
      onClick={() => onRetry(row)}
      className={expanded ? '' : 'ml-1'}
    >
      <RotateCcw className="mr-1 h-3.5 w-3.5" />
      Reintentar
    </Button>
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild><span>{btn}</span></TooltipTrigger>
        <TooltipContent>{tip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

type SlotResolution = {
  input_email: string | null;
  resolved_via: 'mapping' | 'profile' | 'unresolved' | 'absent';
  resolved_profile_id: string | null;
  steps: Array<{ step: string; outcome: 'hit' | 'miss' | 'error'; detail: string }>;
  warnings: string[];
};

function ResolvedViaBadge({ via }: { via: SlotResolution['resolved_via'] }) {
  const variant: 'default' | 'secondary' | 'destructive' | 'outline' =
    via === 'mapping' || via === 'profile' ? 'default' : via === 'unresolved' ? 'destructive' : 'outline';
  const label =
    via === 'mapping' ? 'mapping' :
    via === 'profile' ? 'profile (fallback)' :
    via === 'unresolved' ? 'unresolved' : 'absent';
  return <Badge variant={variant}>{label}</Badge>;
}

function SlotBlock({ title, slot }: { title: string; slot?: SlotResolution }) {
  if (!slot) return null;
  return (
    <div className="border rounded p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-sm">{title}</h4>
        <ResolvedViaBadge via={slot.resolved_via} />
      </div>
      <div className="grid grid-cols-[140px_1fr] gap-x-2 gap-y-1 text-xs">
        <span className="text-muted-foreground">Email recibido</span>
        <code>{slot.input_email ?? '—'}</code>
        <span className="text-muted-foreground">Profile resuelto</span>
        <code className="break-all">{slot.resolved_profile_id ?? '—'}</code>
      </div>
      {slot.steps.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Pasos de resolución</p>
          <ol className="space-y-1 text-xs">
            {slot.steps.map((s, i) => (
              <li key={i} className="flex gap-2">
                <Badge
                  variant={s.outcome === 'hit' ? 'default' : s.outcome === 'error' ? 'destructive' : 'outline'}
                  className="h-5 shrink-0"
                >
                  {s.outcome}
                </Badge>
                <div>
                  <code className="text-xs">{s.step}</code>
                  <p className="text-muted-foreground">{s.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
      {slot.warnings.length > 0 && (
        <div>
          <p className="text-xs font-medium text-destructive mb-1">Warnings</p>
          <ul className="list-disc list-inside text-xs text-destructive space-y-0.5">
            {slot.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function AssignmentPanel({ assignment }: { assignment: { inspector?: SlotResolution; executive?: SlotResolution } }) {
  return (
    <div className="space-y-2">
      <h3 className="font-medium">Resolución de asignación</h3>
      <p className="text-xs text-muted-foreground">
        El intake inyecta los ids resueltos en el payload normalizado. El status final (<code>assigned</code> /
        <code>pending_assignment</code>) lo decide la RPC en función de qué ids estén presentes.
      </p>
      <SlotBlock title="Inspector" slot={assignment.inspector} />
      <SlotBlock title="Executive" slot={assignment.executive} />
    </div>
  );
}
