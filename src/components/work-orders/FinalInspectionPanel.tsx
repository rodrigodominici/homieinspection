import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { finalCheckErrorText, recordFinalCheck } from '@/modules/work-orders/api/final-checks.service';
import { triggerFinalInspectorSync } from '@/lib/hubspot-sync';
import { getSignedPhotoUrl } from '@/lib/photo-urls';

export const VACANCY_TYPES: Record<string, string> = {
  initial: 'Aprobado con la cotización inicial',
  new_tenant: 'Aprobado por nuevo interesado',
  cleaning: 'Aseo post reparaciones',
};

interface Item { id: string; vacancy_type: string | null; repair: { title_snapshot: string } | null }
interface Check { work_order_item_id: string; result: string; comment: string | null; created_at: string; photo_path: string | null }
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
  const [photos, setPhotos] = useState<Record<string, File | null>>({});
  const [inspectionId, setInspectionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: wo }, { data: its }, { data: ch }, { data: rs }] = await Promise.all([
      supabase.from('inspection_work_orders').select('final_inspector_id,inspection_id').eq('id', workOrderId).maybeSingle(),
      supabase.from('inspection_work_order_items').select('id,vacancy_type,repair:inspection_repair_items(title_snapshot)').eq('work_order_id', workOrderId).eq('is_archived', false),
      supabase.from('work_order_final_checks').select('work_order_item_id,result,comment,created_at,photo_path,inspection_id').eq('work_order_id', workOrderId).order('created_at', { ascending: false }),
      supabase.from('profiles').select('id,full_name,markets').eq('role', 'inspector').eq('is_active', true).order('full_name'),
    ]);
    setInspector((wo as { final_inspector_id: string | null } | null)?.final_inspector_id ?? null);
    setInspectionId((wo as { inspection_id: string } | null)?.inspection_id ?? null);
    setItems((its ?? []) as unknown as Item[]);
    setChecks((ch ?? []) as Check[]);
    setReceptors(((rs ?? []) as (Receptor & { markets: string[] | null })[]).filter((r) => !r.markets?.length || r.markets.includes(market)));
  }, [workOrderId, market]);
  useEffect(() => { void load(); }, [load]);

  const run = async (key: string, fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) => {
    setBusy(key);
    const { error } = await fn();
    setBusy(null);
    if (error) { toast.error(finalCheckErrorText(error.message)); return; }
    toast.success(ok); await load(); onChanged?.();
  };

  const canCheck = status === 'in_review' || status === 'approved';
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <p className="text-xs font-medium">Receptor para la revisión final</p>
        <Select value={inspector ?? ''} onValueChange={(v) => run('insp', async () => { const r = await supabase.rpc('set_work_order_final_inspector', { p_work_order_id: workOrderId, p_profile_id: v }); if (!r.error && inspectionId) void triggerFinalInspectorSync(inspectionId); return r; }, 'Receptor asignado')}>
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
            {last?.photo_path && <button type="button" className="text-xs text-primary underline" onClick={async () => window.open(await getSignedPhotoUrl(last.photo_path), '_blank')}>Ver foto</button>}
            <Select value={it.vacancy_type ?? ''} onValueChange={(v) => run(`v${it.id}`, () => supabase.rpc('set_work_item_vacancy_type', { p_item_id: it.id, p_type: v }), 'Tipo guardado')}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Tipo de trabajo de vacancia" /></SelectTrigger>
              <SelectContent>{Object.entries(VACANCY_TYPES).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
            </Select>
            {canCheck && (
              <div className="flex flex-col gap-2 sm:flex-row">
                <input type="file" accept="image/*" className="text-xs" onChange={(e) => setPhotos({ ...photos, [it.id]: e.target.files?.[0] ?? null })} />
                <Input className="h-8 text-xs" placeholder="Comentario (obligatorio si no cumple)" value={notes[it.id] ?? ''} onChange={(e) => setNotes({ ...notes, [it.id]: e.target.value })} />
                <Button size="sm" disabled={!!busy} onClick={() => run(it.id, () => recordFinalCheck({ inspectionId: inspectionId!, itemId: it.id, complies: true, comment: notes[it.id] || null, photo: photos[it.id] }), 'Marcado: cumple')}>
                  {busy === it.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Cumple'}
                </Button>
                <Button size="sm" variant="destructive" disabled={!!busy} onClick={() => run(it.id, () => recordFinalCheck({ inspectionId: inspectionId!, itemId: it.id, complies: false, comment: notes[it.id] ?? '', photo: photos[it.id] }), 'No cumple: la OT volvió al contratista')}>No cumple</Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
