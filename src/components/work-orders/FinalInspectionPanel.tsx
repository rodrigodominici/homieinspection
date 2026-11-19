import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export const VACANCY_TYPES: Record<string, string> = {
  initial: 'Aprobado con la cotización inicial',
  new_tenant: 'Aprobado por nuevo interesado',
  cleaning: 'Aseo post reparaciones',
};

interface Item { id: string; vacancy_type: string | null; repair: { title_snapshot: string } | null }
interface Check { work_order_item_id: string; result: string; comment: string | null; created_at: string }
interface Receptor { id: string; full_name: string }

/** Revisión final por trabajo (cumple / no cumple) y tipo de trabajo de vacancia. */
export default function FinalInspectionPanel({ workOrderId, market, status, onChanged }: {
  workOrderId: string; market: string; status: string; onChanged?: () => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [checks, setChecks] = useState<Check[]>([]);
  const [receptors, setReceptors] = useState<Receptor[]>([]);
  const [inspector, setInspector] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: wo }, { data: its }, { data: ch }, { data: rs }] = await Promise.all([
      supabase.from('inspection_work_orders').select('final_inspector_id').eq('id', workOrderId).maybeSingle(),
      supabase.from('inspection_work_order_items').select('id,vacancy_type,repair:inspection_repair_items(title_snapshot)').eq('work_order_id', workOrderId).eq('is_archived', false),
      supabase.from('work_order_final_checks').select('work_order_item_id,result,comment,created_at').eq('work_order_id', workOrderId).order('created_at', { ascending: false }),
      supabase.from('profiles').select('id,full_name,markets').eq('role', 'inspector').eq('is_active', true).order('full_name'),
    ]);
    setInspector((wo as { final_inspector_id: string | null } | null)?.final_inspector_id ?? null);
    setItems((its ?? []) as unknown as Item[]);
    setChecks((ch ?? []) as Check[]);
    setReceptors(((rs ?? []) as (Receptor & { markets: string[] | null })[]).filter((r) => !r.markets?.length || r.markets.includes(market)));
  }, [workOrderId, market]);
  useEffect(() => { void load(); }, [load]);

  const run = async (key: string, fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) => {
    setBusy(key);
    const { error } = await fn();
    setBusy(null);
    if (error) { toast.error(error.message.includes('note_required') ? 'Escribí qué no cumple' : error.message.includes('invalid_status') ? 'La OT debe estar enviada o aprobada' : 'No se pudo guardar'); return; }
    toast.success(ok); await load(); onChanged?.();
  };

  const canCheck = status === 'in_review' || status === 'approved';
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <p className="text-xs font-medium">Receptor para la revisión final</p>
        <Select value={inspector ?? ''} onValueChange={(v) => run('insp', () => supabase.rpc('set_work_order_final_inspector', { p_work_order_id: workOrderId, p_profile_id: v }), 'Receptor asignado')}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Elegir receptor" /></SelectTrigger>
          <SelectContent>{receptors.map((r) => <SelectItem key={r.id} value={r.id}>{r.full_name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {!canCheck && <p className="text-xs text-muted-foreground">La revisión final se habilita cuando el contratista envía la OT.</p>}
      {items.map((it) => {
        const last = checks.find((c) => c.work_order_item_id === it.id);
        return (
          <div key={it.id} className="space-y-2 rounded-md border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">{it.repair?.title_snapshot ?? 'Trabajo'}</p>
              {last && <Badge variant={last.result === 'complies' ? 'default' : 'destructive'}>{last.result === 'complies' ? 'Cumple' : 'No cumple'}</Badge>}
            </div>
            {last?.comment && <p className="text-xs text-muted-foreground">{last.comment}</p>}
            <Select value={it.vacancy_type ?? ''} onValueChange={(v) => run(`v${it.id}`, () => supabase.rpc('set_work_item_vacancy_type', { p_item_id: it.id, p_type: v }), 'Tipo guardado')}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Tipo de trabajo de vacancia" /></SelectTrigger>
              <SelectContent>{Object.entries(VACANCY_TYPES).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
            </Select>
            {canCheck && (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input className="h-8 text-xs" placeholder="Comentario (obligatorio si no cumple)" value={notes[it.id] ?? ''} onChange={(e) => setNotes({ ...notes, [it.id]: e.target.value })} />
                <Button size="sm" disabled={!!busy} onClick={() => run(it.id, () => supabase.rpc('record_final_check', { p_item_id: it.id, p_complies: true, p_comment: notes[it.id] || null }), 'Marcado: cumple')}>
                  {busy === it.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Cumple'}
                </Button>
                <Button size="sm" variant="destructive" disabled={!!busy} onClick={() => run(it.id, () => supabase.rpc('record_final_check', { p_item_id: it.id, p_complies: false, p_comment: notes[it.id] ?? '' }), 'No cumple: la OT volvió al contratista')}>No cumple</Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
