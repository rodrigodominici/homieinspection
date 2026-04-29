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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, Pencil, X } from 'lucide-react';
import { COMMUNICATION_CHANNELS, COMMUNICATION_PROVIDERS } from '@/lib/communications/events';
import type { CommunicationTemplate } from '@/lib/communications/types';

const MARKETS = [
  { value: '__all__', label: 'Todos' },
  { value: 'CL', label: 'Chile' },
  { value: 'MX', label: 'México' },
];

const empty: Partial<CommunicationTemplate> = {
  template_key: '',
  name: '',
  channel: 'whatsapp',
  provider_key: 'mock',
  market: null,
  language: 'es',
  external_template_name: '',
  variables_json: [],
  preview_text: '',
  is_active: true,
};

export default function AdminCommunicationTemplates() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<CommunicationTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<CommunicationTemplate> | null>(null);
  const [open, setOpen] = useState(false);
  const [varInput, setVarInput] = useState('');

  const fetchAll = async () => {
    setLoading(true);
    const { data } = await supabase.from('communication_templates').select('*').order('name');
    setTemplates((data ?? []) as CommunicationTemplate[]);
    setLoading(false);
  };
  useEffect(() => { fetchAll(); }, []);

  const startNew = () => { setEditing({ ...empty }); setVarInput(''); setOpen(true); };
  const startEdit = (t: CommunicationTemplate) => { setEditing(t); setVarInput(''); setOpen(true); };

  const remove = async (id: string) => {
    if (!confirm('¿Eliminar este template?')) return;
    const { error } = await supabase.from('communication_templates').delete().eq('id', id);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else fetchAll();
  };

  const save = async () => {
    if (!editing) return;
    const payload = {
      template_key: editing.template_key ?? '',
      name: editing.name ?? '',
      channel: editing.channel!,
      provider_key: editing.provider_key!,
      market: editing.market ?? null,
      language: editing.language ?? null,
      external_template_name: editing.external_template_name ?? null,
      variables_json: (editing.variables_json ?? []) as unknown as Record<string, unknown>,
      preview_text: editing.preview_text ?? null,
      is_active: editing.is_active ?? true,
    };
    const { error } = editing.id
      ? await supabase.from('communication_templates').update(payload).eq('id', editing.id)
      : await supabase.from('communication_templates').insert(payload);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else { setOpen(false); fetchAll(); }
  };

  const addVar = () => {
    const v = varInput.trim();
    if (!v || !editing) return;
    const list = editing.variables_json ?? [];
    if (list.includes(v)) return;
    setEditing({ ...editing, variables_json: [...list, v] });
    setVarInput('');
  };
  const removeVar = (v: string) => {
    if (!editing) return;
    setEditing({ ...editing, variables_json: (editing.variables_json ?? []).filter((x) => x !== v) });
  };

  return (
    <AdminLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Templates de comunicación</h1>
            <p className="text-sm text-muted-foreground">Mapeo interno entre claves de Homie y templates reales del proveedor.</p>
          </div>
          <Button onClick={startNew} className="gap-2"><Plus className="h-4 w-4" /> Nuevo template</Button>
        </div>

        <Card>
          <CardHeader><CardTitle>Templates</CardTitle></CardHeader>
          <CardContent>
            {loading ? <p className="text-muted-foreground">Cargando…</p> : templates.length === 0 ? (
              <p className="text-muted-foreground">Aún no hay templates configurados.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Key</TableHead>
                    <TableHead>Canal</TableHead>
                    <TableHead>Proveedor</TableHead>
                    <TableHead>Externo</TableHead>
                    <TableHead>Idioma</TableHead>
                    <TableHead>Activo</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell><code className="text-xs">{t.template_key}</code></TableCell>
                      <TableCell><Badge variant="outline">{t.channel}</Badge></TableCell>
                      <TableCell>{t.provider_key}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{t.external_template_name ?? '—'}</TableCell>
                      <TableCell>{t.language ?? '—'}</TableCell>
                      <TableCell>{t.is_active ? 'Sí' : 'No'}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => startEdit(t)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => remove(t.id)}><Trash2 className="h-4 w-4" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editing?.id ? 'Editar template' : 'Nuevo template'}</DialogTitle></DialogHeader>
            {editing && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Nombre</Label>
                  <Input value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                </div>
                <div>
                  <Label>Template key (único)</Label>
                  <Input value={editing.template_key ?? ''} onChange={(e) => setEditing({ ...editing, template_key: e.target.value })} placeholder="inspection_assigned_inspector_es" />
                </div>
                <div>
                  <Label>Canal</Label>
                  <Select value={editing.channel} onValueChange={(v) => setEditing({ ...editing, channel: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{COMMUNICATION_CHANNELS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Proveedor</Label>
                  <Select value={editing.provider_key} onValueChange={(v) => setEditing({ ...editing, provider_key: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COMMUNICATION_PROVIDERS
                        .filter((p) => p.channels.includes(editing.channel as 'whatsapp' | 'email'))
                        .map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
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
                    <SelectContent>{MARKETS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Idioma</Label>
                  <Input value={editing.language ?? ''} onChange={(e) => setEditing({ ...editing, language: e.target.value })} placeholder="es" />
                </div>
                <div className="col-span-2">
                  <Label>Nombre externo del template (proveedor)</Label>
                  <Input value={editing.external_template_name ?? ''} onChange={(e) => setEditing({ ...editing, external_template_name: e.target.value })} placeholder="inspection_assigned_v1" />
                </div>
                <div className="col-span-2">
                  <Label>Variables</Label>
                  <div className="flex gap-2">
                    <Input value={varInput} onChange={(e) => setVarInput(e.target.value)} placeholder="property_name" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addVar(); } }} />
                    <Button type="button" onClick={addVar} variant="outline">Añadir</Button>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {(editing.variables_json ?? []).map((v) => (
                      <Badge key={v} variant="secondary" className="gap-1">
                        {v}<button onClick={() => removeVar(v)}><X className="h-3 w-3" /></button>
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="col-span-2">
                  <Label>Texto de preview (opcional, soporta {`{{var}}`})</Label>
                  <Textarea value={editing.preview_text ?? ''} onChange={(e) => setEditing({ ...editing, preview_text: e.target.value })} rows={3} />
                </div>
                <div className="col-span-2 flex items-center gap-2">
                  <Switch checked={editing.is_active ?? true} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} />
                  <Label>Template activo</Label>
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
