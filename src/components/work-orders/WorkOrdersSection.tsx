import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import WorkOrderPanel from './WorkOrderPanel';
import {
  assignAdditionalWorkOrder,
  fetchWorkOrderIdsByInspection,
} from '@/modules/work-orders/api/work-orders.service';

type PanelProps = React.ComponentProps<typeof WorkOrderPanel>;

interface FreeItem { id: string; title_snapshot: string; quantity: number; unit: string }
interface ContractorOption { id: string; name: string; country: string }

/** Todas las OT de la inspección (una por proveedor) y creación de OT adicionales con partidas sin asignar. */
export default function WorkOrdersSection(props: PanelProps) {
  const { inspectionId, market, quienRepara, onChanged } = props;
  const [ids, setIds] = useState<string[] | null>(null);
  const [free, setFree] = useState<FreeItem[]>([]);
  const [contractors, setContractors] = useState<ContractorOption[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [contractor, setContractor] = useState('');
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);

  const load = useCallback(async () => {
    const list = await fetchWorkOrderIdsByInspection(inspectionId).catch(() => []);
    setIds(list);
    if (list.length === 0) { setFree([]); return; }
    const [{ data: repairs }, { data: assigned }] = await Promise.all([
      supabase.from('inspection_repair_items').select('id,title_snapshot,quantity,unit,sort_order')
        .eq('inspection_id', inspectionId).eq('is_archived', false).eq('is_pending_quote', false).order('sort_order'),
      supabase.from('inspection_work_order_items').select('repair_item_id').in('work_order_id', list).eq('is_archived', false),
    ]);
    const taken = new Set((assigned ?? []).map((r) => (r as { repair_item_id: string }).repair_item_id));
    setFree(((repairs ?? []) as FreeItem[]).filter((r) => !taken.has(r.id)));
  }, [inspectionId]);

  useEffect(() => { void load(); }, [load, version]);

  useEffect(() => {
    supabase.from('contractors').select('id,name,country').eq('is_active', true).order('name')
      .then(({ data }) => setContractors(((data ?? []) as ContractorOption[]).filter((c) => !market || !c.country || c.country === market)));
  }, [market]);

  const changed = () => { setVersion((v) => v + 1); onChanged?.(); };

  if (quienRepara !== 'homie') return null;
  if (ids === null) return null;
  if (ids.length === 0) return <WorkOrderPanel {...props} onChanged={changed} />;

  const handleCreate = async () => {
    if (!contractor) { toast.error('Selecciona la empresa contratista'); return; }
    if (picked.length === 0) { toast.error('Selecciona al menos una partida'); return; }
    setBusy(true);
    try {
      await assignAdditionalWorkOrder(inspectionId, contractor, picked);
      toast.success('Nueva orden de trabajo creada');
      setPicked([]); setContractor('');
      changed();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo crear la orden');
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      {ids.map((id, i) => (
        <WorkOrderPanel key={`${id}-${version}`} {...props} workOrderId={id} onChanged={changed}
          title={ids.length > 1 ? `Orden de trabajo ${i + 1}` : undefined} />
      ))}
      {free.length > 0 && (
        <Card className="border-0 ring-1 ring-border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Plus className="h-4 w-4" /> Nueva OT para otro proveedor</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">Partidas aprobadas que todavía no están en ninguna orden de trabajo.</p>
            <div className="space-y-2">
              {free.map((r) => (
                <label key={r.id} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={picked.includes(r.id)}
                    onCheckedChange={(v) => setPicked((p) => v ? [...p, r.id] : p.filter((x) => x !== r.id))} />
                  <span className="min-w-0 truncate">{r.title_snapshot}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{r.quantity} {r.unit}</span>
                </label>
              ))}
            </div>
            <div className="space-y-2">
              <Label>Empresa contratista</Label>
              <Select value={contractor} onValueChange={setContractor}>
                <SelectTrigger><SelectValue placeholder="Selecciona una empresa" /></SelectTrigger>
                <SelectContent>{contractors.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button onClick={handleCreate} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Crear orden de trabajo
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
