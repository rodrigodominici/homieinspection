import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Download, History, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { getSignedPhotoUrlMap } from '@/lib/photo-urls';
import { keysStatusLabel, workOrderItemStatusLabel, workOrderStatusLabel } from '@/lib/work-order-status';

interface ReportItem {
  work_order_item_id: string; title: string; quantity: number; unit: string; section: string | null;
  status: string; comment: string | null; not_done_reason: string | null;
  photos: { storage_path: string; stage: string | null }[];
}
interface ReportPayload {
  contractor: string | null; items: ReportItem[]; keys_status: string | null;
  signature_name: string | null; signed_at: string | null; review_note: string | null;
}
interface ReportVersion {
  id: string; version_number: number; work_order_status: string; payload_json: ReportPayload;
  note: string | null; created_at: string;
}

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

async function download(v: ReportVersion, title: string) {
  // Abrir la ventana antes de esperar, para que el navegador no la bloquee.
  const w = window.open('', '_blank');
  if (!w) { toast.error('Permití las ventanas emergentes para descargar'); return; }
  w.document.write('<p style="font-family:sans-serif">Preparando informe…</p>');
  const p = v.payload_json;
  const photos = p.items.flatMap((i) => i.photos.map((ph) => ({ id: ph.storage_path, storage_path: ph.storage_path })));
  const urls = photos.length ? await getSignedPhotoUrlMap(photos) : {};
  const items = p.items.map((i) => `
    <div class="item"><h3>${esc(i.title)} <span>${esc(workOrderItemStatusLabel(i.status))}</span></h3>
    <p class="muted">${esc(i.section ?? '')} · ${i.quantity} ${esc(i.unit)}</p>
    ${i.comment ? `<p>${esc(i.comment)}</p>` : ''}${i.not_done_reason ? `<p>Motivo: ${esc(i.not_done_reason)}</p>` : ''}
    <div class="grid">${i.photos.map((ph) => urls[ph.storage_path] ? `<figure><img src="${esc(urls[ph.storage_path])}"><figcaption>${ph.stage === 'before' ? 'Antes' : 'Después'}</figcaption></figure>` : '').join('')}</div></div>`).join('');
  w.document.open();
  w.document.write(`<html><head><meta charset="utf-8"><title>Informe de ejecución v${v.version_number}</title><style>
    body{font-family:sans-serif;padding:24px;font-size:12px}.muted{color:#666}.item{border:1px solid #ddd;border-radius:6px;padding:10px;margin:10px 0;break-inside:avoid}
    h3{margin:0;font-size:14px}h3 span{font-weight:normal;font-size:11px;color:#555}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
    img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:4px}figure{margin:0}figcaption{font-size:10px;color:#666}</style></head><body>
    <h2>Informe de ejecución · ${esc(title)}</h2>
    <p>Versión ${v.version_number} · ${new Date(v.created_at).toLocaleString('es-CL')} · ${esc(workOrderStatusLabel(v.work_order_status))}${p.contractor ? ` · ${esc(p.contractor)}` : ''}</p>
    ${v.note ? `<p>${esc(v.note)}</p>` : ''}${items}
    ${p.keys_status ? `<p>Llaves: ${esc(keysStatusLabel(p.keys_status))}</p>` : ''}
    ${p.signature_name ? `<p>Conformidad firmada por ${esc(p.signature_name)}${p.signed_at ? ` el ${new Date(p.signed_at).toLocaleString('es-CL')}` : ''}</p>` : ''}
    ${p.review_note ? `<p>Observación de revisión: ${esc(p.review_note)}</p>` : ''}
    <script>Promise.all([...document.images].map(i=>i.complete?0:new Promise(r=>{i.onload=i.onerror=r}))).then(()=>window.print())</script></body></html>`);
  w.document.close();
}

/** Versiones guardadas del informe de ejecución de una OT, descargables. */
export default function ExecutionReportVersions({ workOrderId, title }: { workOrderId: string; title: string }) {
  const [list, setList] = useState<ReportVersion[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('work_order_execution_reports').select('*')
      .eq('work_order_id', workOrderId).order('version_number', { ascending: false });
    setList((data ?? []) as unknown as ReportVersion[]);
  }, [workOrderId]);
  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.rpc('create_execution_report_version', { p_work_order_id: workOrderId, p_note: note });
      if (error) throw error;
      toast.success('Versión del informe guardada');
      setNote('');
      await load();
    } catch {
      toast.error('No se pudo guardar la versión del informe');
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-2 border-t pt-3">
      <p className="text-xs font-medium flex items-center gap-1"><History className="h-3.5 w-3.5" /> Versiones del informe de ejecución</p>
      <p className="text-[11px] text-muted-foreground">Guardá cómo está el informe ahora. Cada versión queda fija y se puede descargar.</p>
      <div className="flex gap-2">
        <Input className="h-8 text-xs" placeholder="Nota (opcional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
        <Button size="sm" variant="outline" onClick={create} disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Guardar versión
        </Button>
      </div>
      {list.map((v) => (
        <div key={v.id} className="flex items-center justify-between text-xs">
          <span>Versión {v.version_number} · {new Date(v.created_at).toLocaleDateString('es-CL')} · {workOrderStatusLabel(v.work_order_status)}{v.note ? ` · ${v.note}` : ''}</span>
          <Button size="sm" variant="ghost" aria-label={`Descargar versión ${v.version_number}`} onClick={() => void download(v, title)}><Download className="h-3.5 w-3.5" /></Button>
        </div>
      ))}
    </div>
  );
}
