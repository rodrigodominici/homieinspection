import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { RefreshCw, RotateCcw } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { useToast } from '@/hooks/use-toast';
import type { Tables } from '@/integrations/supabase/types';

type Row = Tables<'rent_manager_outbox'>;
const labels: Record<string,string> = { pending:'En espera', sending:'Enviando', sent:'Enviado', error:'Error', skipped:'Omitido' };
export default function AdminIntegrationRentManager() {
  const { toast } = useToast();
  const [params] = useSearchParams();
  const [rows,setRows] = useState<Row[]>([]);
  const [status,setStatus] = useState('all');
  const [search,setSearch] = useState(params.get('inspection') ?? '');
  const [selected,setSelected] = useState<Row|null>(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const load = useCallback(async () => {
    setBusy(true); setError('');
    let q = supabase.from('rent_manager_outbox').select('*').order('created_at',{ascending:false}).limit(200);
    if(status!=='all') q=q.eq('status',status);
    const { data,error } = await q;
    if(error) setError('No se pudieron cargar los avisos.'); else setRows(data ?? []);
    setBusy(false);
  },[status]);
  useEffect(()=>{ void load(); },[load]);
  async function retry(id: string|null, stalled=false) {
    setBusy(true);
    const { error } = await supabase.rpc('rm_retry_outbox',{p_id:id ?? undefined,p_stalled:stalled});
    if(error) toast({title:'No se pudo reintentar',variant:'destructive'});
    else toast({title:'Avisos preparados para reintentar'});
    await load();
  }
  async function simulate() {
    setBusy(true);
    const {data,error} = await supabase.functions.invoke('rent-manager-dispatch',{body:{simulate:true,origin:window.location.origin}});
    toast(error ? {title:'No se pudo ejecutar la prueba',variant:'destructive'} : {title:`Prueba simulada: ${data?.simulated ?? 0} avisos`});
    await load();
  }
  const filtered=rows.filter(r=> !search || [r.inspection_id,r.rm_inspection_id,r.external_object_id,r.event_id].some(v=>v.toLowerCase().includes(search.toLowerCase())));
  return <AdminLayout><div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
    <div className="flex flex-wrap justify-between items-start gap-3"><div><Link to="/admin/integrations" className="text-sm text-muted-foreground hover:underline">Integraciones</Link><h1 className="text-2xl font-semibold">Integración Rent Manager</h1></div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={()=>void load()}><RefreshCw className="h-4 w-4 mr-2"/>Actualizar</Button><Button variant="outline" disabled={busy} onClick={()=>void retry(null,true)}><RotateCcw className="h-4 w-4 mr-2"/>Reintentar trabados</Button><Button disabled={busy} onClick={()=>void simulate()}>Probar receptor simulado</Button></div></div>
    <div className="flex flex-wrap gap-3"><Select value={status} onValueChange={setStatus}><SelectTrigger className="w-44" aria-label="Estado de los avisos"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">Todos los estados</SelectItem>{Object.entries(labels).map(([v,l])=><SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select><Input className="max-w-md" aria-label="Buscar inspección" placeholder="Buscar inspección o inmueble" value={search} onChange={e=>setSearch(e.target.value)}/></div>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <div className="overflow-x-auto border rounded-lg"><table className="w-full text-sm"><thead className="bg-muted"><tr>{['Fecha','Evento','Inspección RM','Estado','Intentos','Respuesta',''].map((h,i)=><th key={i} className="text-left p-3 whitespace-nowrap">{h}</th>)}</tr></thead><tbody>
      {filtered.map(r=><tr key={r.id} className="border-t"><td className="p-3 whitespace-nowrap">{new Date(r.created_at).toLocaleString('es-CL')}</td><td className="p-3"><code className="text-xs">{r.event_type}</code></td><td className="p-3"><Link className="text-primary hover:underline" to={`/admin/inspections/${r.inspection_id}`}>{r.rm_inspection_id}</Link></td><td className="p-3"><Badge variant={r.status==='error'?'destructive':r.status==='sent'?'default':'secondary'}>{labels[r.status]}</Badge>{r.simulated_at&&<Badge variant="outline" className="mt-1">Simulado</Badge>}</td><td className="p-3">{r.attempts}</td><td className="p-3">{r.response_status??'—'}</td><td className="p-3 whitespace-nowrap"><Button variant="link" onClick={()=>setSelected(r)}>Detalle</Button>{r.status==='error'&&<Button variant="outline" disabled={busy} onClick={()=>void retry(r.id)}><RotateCcw className="h-4 w-4 mr-2"/>Reintentar</Button>}</td></tr>)}
      {!filtered.length&&<tr><td colSpan={7} className="p-8 text-center text-muted-foreground">{busy?'Cargando…':'Sin avisos'}</td></tr>}
    </tbody></table></div>
    <Sheet open={Boolean(selected)} onOpenChange={open=>{if(!open)setSelected(null);}}><SheetContent className="sm:max-w-2xl overflow-y-auto">{selected&&<><SheetHeader><SheetTitle>{selected.event_type}</SheetTitle><SheetDescription>{selected.event_id}</SheetDescription></SheetHeader><div className="mt-5 space-y-4 text-sm"><Badge>{labels[selected.status]}</Badge>{selected.last_error&&<p className="text-destructive">{selected.last_error}</p>}{selected.next_attempt_at&&<p>Próximo intento: {new Date(selected.next_attempt_at).toLocaleString('es-CL')}</p>}{[['Cuerpo del aviso',selected.payload],['Respuesta de Rent Manager',selected.response_body],['Respuesta simulada',selected.simulated_response]].map(([title,value])=><section key={String(title)}><h2 className="font-medium mb-2">{String(title)}</h2><pre className="bg-muted p-3 rounded overflow-auto text-xs max-h-80">{JSON.stringify(value,null,2)}</pre></section>)}</div></>}</SheetContent></Sheet>
  </div></AdminLayout>;
}