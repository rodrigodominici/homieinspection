import { useCallback, useEffect, useState } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Link } from 'react-router-dom';
import { Search, RefreshCw, ExternalLink } from 'lucide-react';

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
};

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

export default function AdminIntegrationHubSpotOutboundLogs() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<LogRow | null>(null);

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

  const filtered = rows.filter((r) => {
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
                  <th className="text-left px-4 py-3">HubSpot ID</th>
                  <th className="text-left px-4 py-3">Event time</th>
                  <th className="text-left px-4 py-3">Estado</th>
                  <th className="text-left px-4 py-3">HTTP</th>
                  <th className="text-left px-4 py-3">Error</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
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
                      <code className="text-xs">{r.hubspot_object_id ?? '—'}</code>
                    </td>
                    <td className="px-4 py-3 align-top text-xs whitespace-nowrap">
                      {r.event_time ? new Date(r.event_time).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <Badge variant={STATUS_VARIANTS[r.status] ?? 'outline'}>
                        {STATUS_LABELS[r.status] ?? r.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 align-top text-xs">{r.response_status ?? '—'}</td>
                    <td className="px-4 py-3 align-top text-xs text-destructive">
                      <div className="max-w-[220px] truncate">{r.error_message ?? ''}</div>
                    </td>
                    <td className="px-4 py-3 align-top whitespace-nowrap">
                      <Button size="sm" variant="link" className="text-sm px-0 h-auto" onClick={() => setSelected(r)}>Detalles</Button>
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
    </AdminLayout>
  );
}
