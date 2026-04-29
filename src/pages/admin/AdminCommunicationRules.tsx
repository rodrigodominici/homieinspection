import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import AdminLayout from '@/components/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, Pencil } from 'lucide-react';
import {
  COMMUNICATION_EVENT_CATALOG,
  COMMUNICATION_CHANNELS,
  COMMUNICATION_PROVIDERS,
  RECIPIENT_TYPES,
} from '@/lib/communications/events';
import type { CommunicationRule, CommunicationTemplate } from '@/lib/communications/types';

const MARKETS = [
  { value: '__all__', label: 'Todos' },
  { value: 'CL', label: 'Chile' },
  { value: 'MX', label: 'México' },
];

const emptyRule: Partial<CommunicationRule> = {
  name: '',
  event_name: COMMUNICATION_EVENT_CATALOG[0].name,
  is_active: true,
  channel: 'whatsapp',
  provider_key: 'mock',
  template_key: '',
  recipient_type: 'inspector',
  market: null,
  conditions_json: null,
};

export default function AdminCommunicationRules() {
  const { toast } = useToast();
  const [rules, setRules] = useState<CommunicationRule[]>([]);
  const [templates, setTemplates] = useState<CommunicationTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<CommunicationRule> | null>(null);
  const [open, setOpen] = useState(false);
  const [conditionsText, setConditionsText] = useState('');

  const fetchAll = async () => {
    setLoading(true);
    const [r, t] = await Promise.all([
      supabase.from('communication_rules').select('*').order('created_at', { ascending: false }),
      supabase.from('communication_templates').select('*').order('name'),
    ]);
    setRules((r.data ?? []) as CommunicationRule[]);
    setTemplates((t.data ?? []) as CommunicationTemplate[]);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const startNew = () => {
    setEditing({ ...emptyRule });
    setConditionsText('');
    setOpen(true);
  };
  const startEdit = (r: CommunicationRule) => {
    setEditing(r);
    setConditionsText(r.conditions_json ? JSON.stringify(r.conditions_json, null, 2) : '');
    setOpen(true);
  };

  const toggleActive = async (r: CommunicationRule) => {
    const { error } = await supabase
      .from('communication_rules')
      .update({ is_active: !r.is_active })
      .eq('id', r.id);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else fetchAll();
  };

  const remove = async (id: string) => {
    if (!confirm('¿Eliminar esta regla?')) return;
    const { error } = await supabase.from('communication_rules').delete().eq('id', id);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else fetchAll();
  };

  const save = async () => {
    if (!editing) return;
    let parsedConditions: Record<string, unknown> | null = null;
    if (conditionsText.trim()) {
      try { parsedConditions = JSON.parse(conditionsText); }
      catch { toast({ title: 'JSON inválido en condiciones', variant: 'destructive' }); return; }
    }
    const payload = {
      name: editing.name ?? '',
      event_name: editing.event_name!,
      is_active: editing.is_active ?? true,
      channel: editing.channel!,
      provider_key: editing.provider_key!,
      template_key: editing.template_key ?? '',
      recipient_type: editing.recipient_type!,
      market: editing.market ?? null,
      conditions_json: parsedConditions,
    };
    const { error } = editing.id
      ? await supabase.from('communication_rules').update(payload as never).eq('id', editing.id)
      : await supabase.from('communication_rules').insert(payload as never);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else { setOpen(false); fetchAll(); }
  };

  const compatibleTemplates = templates.filter(
    (t) => t.channel === editing?.channel && t.provider_key === editing?.provider_key,
  );

  return (
    <AdminLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Reglas de comunicación</h1>
            <p className="text-sm text-muted-foreground">Configura qué eventos disparan envíos y por qué canal/proveedor.</p>
          </div>
          <Button onClick={startNew} className="gap-2"><Plus className="h-4 w-4" /> Nueva regla</Button>
        </div>

        <Card>
          <CardHeader><CardTitle>Reglas activas e inactivas</CardTitle></CardHeader>
          <CardContent>
            {loading ? <p className="text-muted-foreground">Cargando…</p> : rules.length === 0 ? (
              <p className="text-muted-foreground">Aún no hay reglas configuradas.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Evento</TableHead>
                    <TableHead>Canal</TableHead>
                    <TableHead>Proveedor</TableHead>
                    <TableHead>Template</TableHead>
                    <TableHead>Destinatario</TableHead>
                    <TableHead>Mercado</TableHead>
                    <TableHead>Activa</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell><code className="text-xs">{r.event_name}</code></TableCell>
                      <TableCell><Badge variant="outline">{r.channel}</Badge></TableCell>
                      <TableCell>{r.provider_key}</TableCell>
                      <TableCell><code className="text-xs">{r.template_key}</code></TableCell>
                      <TableCell>{r.recipient_type}</TableCell>
                      <TableCell>{r.market ?? '—'}</TableCell>
                      <TableCell><Switch checked={r.is_active} onCheckedChange={() => toggleActive(r)} /></TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => startEdit(r)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => remove(r.id)}><Trash2 className="h-4 w-4" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>{editing?.id ? 'Editar regla' : 'Nueva regla'}</DialogTitle></DialogHeader>
            {editing && (
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label>Nombre</Label>
                  <Input value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                </div>
                <div className="col-span-2">
                  <Label>Evento</Label>
                  <Select value={editing.event_name} onValueChange={(v) => setEditing({ ...editing, event_name: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COMMUNICATION_EVENT_CATALOG.map((e) => (
                        <SelectItem key={e.name} value={e.name}>{e.label} — <code>{e.name}</code></SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Canal</Label>
                  <Select value={editing.channel} onValueChange={(v) => setEditing({ ...editing, channel: v, template_key: '' })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COMMUNICATION_CHANNELS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Proveedor</Label>
                  <Select value={editing.provider_key} onValueChange={(v) => setEditing({ ...editing, provider_key: v, template_key: '' })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COMMUNICATION_PROVIDERS
                        .filter((p) => p.channels.includes(editing.channel as 'whatsapp' | 'email'))
                        .map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Destinatario</Label>
                  <Select value={editing.recipient_type} onValueChange={(v) => setEditing({ ...editing, recipient_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {RECIPIENT_TYPES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Mercado</Label>
                  <Select
                    value={editing.market ?? '__all__'}
                    onValueChange={(v) => setEditing({ ...editing, market: v === '__all__' ? null : v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MARKETS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label>Template</Label>
                  <Select value={editing.template_key} onValueChange={(v) => setEditing({ ...editing, template_key: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecciona template compatible…" /></SelectTrigger>
                    <SelectContent>
                      {compatibleTemplates.length === 0 ? (
                        <div className="px-2 py-1 text-sm text-muted-foreground">No hay templates compatibles</div>
                      ) : compatibleTemplates.map((t) => (
                        <SelectItem key={t.id} value={t.template_key}>{t.name} ({t.template_key})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label>Condiciones (JSON, opcional)</Label>
                  <Textarea
                    value={conditionsText}
                    onChange={(e) => setConditionsText(e.target.value)}
                    placeholder='{ "property_type": "departamento" }'
                    rows={4}
                    className="font-mono text-xs"
                  />
                </div>
                <div className="col-span-2 flex items-center gap-2">
                  <Switch checked={editing.is_active ?? true} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} />
                  <Label>Regla activa</Label>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={save}>Guardar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
