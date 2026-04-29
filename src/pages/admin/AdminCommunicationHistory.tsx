import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import AdminLayout from '@/components/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { COMMUNICATION_EVENT_CATALOG, COMMUNICATION_CHANNELS } from '@/lib/communications/events';
import type { CommunicationDelivery } from '@/lib/communications/types';

const STATUSES = ['pending', 'sent', 'error', 'skipped'] as const;

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  sent: 'default',
  pending: 'secondary',
  error: 'destructive',
  skipped: 'outline',
};

export default function AdminCommunicationHistory() {
  const [deliveries, setDeliveries] = useState<CommunicationDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventFilter, setEventFilter] = useState<string>('__all__');
  const [statusFilter, setStatusFilter] = useState<string>('__all__');
  const [channelFilter, setChannelFilter] = useState<string>('__all__');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<CommunicationDelivery | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('communication_deliveries')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    setDeliveries((data ?? []) as CommunicationDelivery[]);
    setLoading(false);
  };
  useEffect(() => { fetchAll(); }, []);

  const filtered = useMemo(() => {
    return deliveries.filter((d) => {
      if (eventFilter !== '__all__' && d.event_name !== eventFilter) return false;
      if (statusFilter !== '__all__' && d.status !== statusFilter) return false;
      if (channelFilter !== '__all__' && d.channel !== channelFilter) return false;
      if (search.trim() && !(d.inspection_id ?? '').includes(search.trim())) return false;
      return true;
    });
  }, [deliveries, eventFilter, statusFilter, channelFilter, search]);

  return (
    <AdminLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Historial de comunicaciones</h1>
            <p className="text-sm text-muted-foreground">Trazabilidad de cada intento de envío disparado por el sistema.</p>
          </div>
          <Button variant="outline" onClick={fetchAll}>Refrescar</Button>
        </div>

        <Card>
          <CardHeader><CardTitle>Filtros</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <Label>Evento</Label>
              <Select value={eventFilter} onValueChange={setEventFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos</SelectItem>
                  {COMMUNICATION_EVENT_CATALOG.map((e) => <SelectItem key={e.name} value={e.name}>{e.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos</SelectItem>
                  {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Canal</Label>
              <Select value={channelFilter} onValueChange={setChannelFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos</SelectItem>
                  {COMMUNICATION_CHANNELS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Inspection ID</Label>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="uuid…" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Envíos ({filtered.length})</CardTitle></CardHeader>
          <CardContent>
            {loading ? <p className="text-muted-foreground">Cargando…</p> : filtered.length === 0 ? (
              <p className="text-muted-foreground">Sin envíos registrados.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Evento</TableHead>
                    <TableHead>Canal</TableHead>
                    <TableHead>Proveedor</TableHead>
                    <TableHead>Destinatario</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((d) => (
                    <TableRow key={d.id} className="cursor-pointer" onClick={() => setSelected(d)}>
                      <TableCell className="text-xs">{format(new Date(d.created_at), 'dd/MM HH:mm:ss')}</TableCell>
                      <TableCell><code className="text-xs">{d.event_name}</code></TableCell>
                      <TableCell><Badge variant="outline">{d.channel}</Badge></TableCell>
                      <TableCell>{d.provider_key}</TableCell>
                      <TableCell className="text-xs">{d.recipient_value ?? '—'}</TableCell>
                      <TableCell><Badge variant={statusVariant[d.status] ?? 'outline'}>{d.status}</Badge></TableCell>
                      <TableCell className="text-xs text-destructive">{d.error_message ?? ''}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Sheet open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
          <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
            <SheetHeader><SheetTitle>Detalle de envío</SheetTitle></SheetHeader>
            {selected && (
              <div className="space-y-4 mt-4 text-sm">
                <div><Label>Evento</Label><div><code>{selected.event_name}</code></div></div>
                <div><Label>Inspección</Label><div className="font-mono text-xs">{selected.inspection_id ?? '—'}</div></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label>Canal</Label><div>{selected.channel}</div></div>
                  <div><Label>Proveedor</Label><div>{selected.provider_key}</div></div>
                  <div><Label>Destinatario</Label><div>{selected.recipient_type}</div></div>
                  <div><Label>Valor</Label><div className="break-all">{selected.recipient_value ?? '—'}</div></div>
                  <div><Label>Template</Label><div><code>{selected.template_key ?? '—'}</code></div></div>
                  <div><Label>Status</Label><div><Badge variant={statusVariant[selected.status]}>{selected.status}</Badge></div></div>
                </div>
                {selected.error_message && (
                  <div><Label>Error</Label><div className="text-destructive">{selected.error_message}</div></div>
                )}
                {selected.provider_message_id && (
                  <div><Label>Provider message ID</Label><div className="font-mono text-xs break-all">{selected.provider_message_id}</div></div>
                )}
                <div>
                  <Label>Request</Label>
                  <pre className="bg-muted p-3 rounded text-xs overflow-x-auto">{JSON.stringify(selected.request_payload_json, null, 2)}</pre>
                </div>
                <div>
                  <Label>Response</Label>
                  <pre className="bg-muted p-3 rounded text-xs overflow-x-auto">{JSON.stringify(selected.response_payload_json, null, 2)}</pre>
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </AdminLayout>
  );
}
