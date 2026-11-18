import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Download, FileCheck2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { workOrderItemStatusLabel } from '@/lib/work-order-status';
import type { WorkOrderDetail } from '@/modules/work-orders/api/work-orders.service';

interface SettlementLine {
  title: string; unit: string; status: string; approved_quantity: number; final_quantity: number;
  unit_price: number; approved_subtotal: number; final_subtotal: number; comment: string | null; not_done_reason: string | null;
}
interface Settlement {
  id: string; version_number: number; lines_json: SettlementLine[]; approved_subtotal: number; final_subtotal: number;
  vat_percentage: number; final_total: number; currency: string; note: string | null; created_at: string;
}

const money = (n: number, currency: string) =>
  new Intl.NumberFormat(currency === 'MXN' ? 'es-MX' : 'es-CL', { style: 'currency', currency, maximumFractionDigits: currency === 'CLP' ? 0 : 2 }).format(n);

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

function download(s: Settlement, title: string) {
  const rows = s.lines_json.map((l) => `<tr><td>${esc(l.title)}${l.comment ? `<br><small>${esc(l.comment)}</small>` : ''}</td><td>${workOrderItemStatusLabel(l.status)}</td><td>${l.approved_quantity}</td><td>${l.final_quantity}</td><td>${money(l.unit_price, s.currency)}</td><td>${money(l.final_subtotal, s.currency)}</td></tr>`).join('');
  const html = `<html><head><meta charset="utf-8"><title>Cotización final v${s.version_number}</title><style>body{font-family:sans-serif;padding:24px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ccc;padding:6px;font-size:12px;text-align:left}</style></head><body><h2>Cotización final · ${esc(title)}</h2><p>Versión ${s.version_number} · ${new Date(s.created_at).toLocaleString('es-CL')}</p>${s.note ? `<p>${esc(s.note)}</p>` : ''}<table><tr><th>Partida</th><th>Estado</th><th>Cant. aprobada</th><th>Cant. final</th><th>Precio</th><th>Subtotal final</th></tr>${rows}</table><p>Aprobado: ${money(s.approved_subtotal, s.currency)}<br>Final neto: ${money(s.final_subtotal, s.currency)}<br>IVA ${s.vat_percentage}%<br><b>Total final: ${money(s.final_total, s.currency)}</b></p><script>window.print()</script></body></html>`;
  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
}

/** Cierre de la cotización con lo realmente ejecutado, para cobrar el finiquito. */
export default function FinalSettlementPanel({ detail, title }: { detail: WorkOrderDetail; title: string }) {
  const [list, setList] = useState<Settlement[]>([]);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const items = detail.items.filter((i) => !i.repair?.is_pending_quote);

  const load = useCallback(async () => {
    const { data } = await supabase.from('quotation_final_settlements').select('*')
      .eq('work_order_id', detail.order.id).order('version_number', { ascending: false });
    setList((data ?? []) as unknown as Settlement[]);
  }, [detail.order.id]);
  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    setBusy(true);
    try {
      const lines = items.map((i) => ({
        work_order_item_id: i.id,
        ...(qty[i.id] !== undefined && qty[i.id] !== '' ? { final_quantity: Number(qty[i.id]) } : {}),
        comment: comments[i.id] ?? '',
      }));
      const { error } = await supabase.rpc('create_final_settlement', { p_work_order_id: detail.order.id, p_lines: lines, p_note: note });
      if (error) throw error;
      toast.success('Cotización final generada');
      setNote('');
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      toast.error(msg.includes('invalid_final_quantity') ? 'La cantidad final no puede superar la aprobada' : 'No se pudo generar la cotización final');
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <FileCheck2 className="h-4 w-4 text-primary" />
        <p className="text-sm font-medium">Cotización final (finiquito)</p>
      </div>
      <p className="text-xs text-muted-foreground">Por defecto se cobran las partidas terminadas completas y las «Por ejecutar» quedan en cero. Ajustá la cantidad si se ejecutó una parte.</p>
      <div className="space-y-2">
        {items.map((i) => (
          <div key={i.id} className="grid grid-cols-[1fr_auto] gap-2 items-center">
            <div className="min-w-0">
              <p className="text-xs font-medium truncate">{i.repair?.title_snapshot}</p>
              <p className="text-[11px] text-muted-foreground">{workOrderItemStatusLabel(i.status)} · aprobado {i.repair?.quantity} {i.repair?.unit}</p>
              <Input className="mt-1 h-7 text-xs" placeholder="Comentario (opcional)" value={comments[i.id] ?? ''} onChange={(e) => setComments({ ...comments, [i.id]: e.target.value })} />
            </div>
            <Input type="number" min={0} max={i.repair?.quantity} step="any" className="h-8 w-20 text-xs"
              placeholder={String(i.status === 'done' ? i.repair?.quantity ?? 0 : 0)}
              value={qty[i.id] ?? ''} onChange={(e) => setQty({ ...qty, [i.id]: e.target.value })} aria-label="Cantidad final" />
          </div>
        ))}
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Nota</Label>
        <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <Button size="sm" onClick={create} disabled={busy}>
        {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Generar cotización final
      </Button>
      {list.length > 0 && (
        <div className="space-y-1 pt-2 border-t">
          {list.map((s) => (
            <div key={s.id} className="flex items-center justify-between text-xs">
              <span>Versión {s.version_number} · {new Date(s.created_at).toLocaleDateString('es-CL')} · {money(s.final_total, s.currency)} <span className="text-muted-foreground">(aprobado {money(s.approved_subtotal, s.currency)} neto)</span></span>
              <Button size="sm" variant="ghost" onClick={() => download(s, title)}><Download className="h-3.5 w-3.5" /></Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
