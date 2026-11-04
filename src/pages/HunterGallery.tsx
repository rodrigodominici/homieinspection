import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { LogOut, Camera, Search } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AssignedMarketingGallery } from '@/components/photos/AssignedMarketingGallery';

interface Captacion { id: string; property_id: string; address: string; market: string; photo_count: number; }
export default function HunterGallery() {
  const { signOut } = useAuth();
  const [params, setParams] = useSearchParams();
  const selected = params.get('captacion');
  const [search, setSearch] = useState('');
  const [market, setMarket] = useState('all');
  const [offset, setOffset] = useState(0);
  const { data = [], error, isLoading, refetch } = useQuery({
    queryKey: ['hunter-captaciones', search, market, offset],
    queryFn: async () => {
      const result = await supabase.rpc('get_hunter_captaciones', { p_search: search, p_market: market === 'all' ? '' : market, p_offset: offset });
      if (result.error) throw result.error;
      return (result.data ?? []) as unknown as Captacion[];
    },
  });
  return <main className="min-h-screen bg-background">
    <header className="border-b bg-card"><div className="max-w-6xl mx-auto px-4 py-5 flex items-center justify-between gap-4">
      <div><h1 className="text-h2">Fotos de comercialización</h1><p className="text-sm text-muted-foreground">Hunter · Chile y México</p></div>
      <Button variant="ghost" size="icon" aria-label="Cerrar sesión" title="Cerrar sesión" onClick={() => void signOut()}><LogOut className="h-5 w-5" /></Button>
    </div></header>
    <div className="max-w-6xl mx-auto p-4 space-y-5">
      {selected && <div className="space-y-3 border-b pb-5"><Button variant="ghost" onClick={() => setParams({})}>Volver a captaciones</Button><AssignedMarketingGallery captacionId={selected} propertyId={data.find(i => i.id === selected)?.property_id ?? selected} /></div>}
      <div className="flex flex-wrap gap-3"><div className="relative flex-1 min-w-48"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"/><Input aria-label="Buscar inmueble" className="pl-9" placeholder="Dirección o ID del inmueble" value={search} onChange={e => { setSearch(e.target.value); setOffset(0); }} /></div>
        <Select value={market} onValueChange={v => { setMarket(v); setOffset(0); }}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Chile y México</SelectItem><SelectItem value="CL">Chile</SelectItem><SelectItem value="MX">México</SelectItem></SelectContent></Select>
      </div>
      {isLoading ? <p role="status">Cargando captaciones…</p> : error ? <div role="alert">No se pudieron cargar las captaciones.<Button variant="link" onClick={() => void refetch()}>Reintentar</Button></div> : !data.length ? <p>No hay captaciones con fotos.</p> : <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.map(i => <article key={i.id} className="border rounded-lg bg-card p-4 space-y-3"><div className="flex gap-2 items-center text-sm text-muted-foreground"><Camera className="h-4 w-4"/>{i.market === 'CL' ? 'Chile' : 'México'} · {i.photo_count} fotos</div><h2 className="font-semibold break-words">{i.address || i.property_id}</h2><p className="text-xs text-muted-foreground break-all">{i.property_id}</p><AssignedMarketingGallery captacionId={i.id} propertyId={i.property_id}/></article>)}
      </div>}
      <nav className="flex justify-between gap-3" aria-label="Páginas"><Button variant="outline" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 30))}>Anterior</Button><Button variant="outline" disabled={data.length < 30} onClick={() => setOffset(offset + 30)}>Siguiente</Button></nav>
    </div>
  </main>;
}