import { useCallback, useEffect, useState } from 'react';
import { Download, Loader2, Images } from 'lucide-react';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { buildMarketingZip, photoFilename, saveMarketingFile, type MarketingPhoto } from '@/lib/marketing-photo-download';

interface SharedPhoto extends MarketingPhoto { signed_url: string }
interface Gallery { property: string; expires_at: string; photos: SharedPhoto[] }
export default function MarketingPhotoShare() {
  const token = useLocation().hash.slice(1);
  const [gallery, setGallery] = useState<Gallery | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [zip, setZip] = useState<Blob | null>(null);
  const [selected, setSelected] = useState<SharedPhoto | null>(null);
  const load = useCallback(async () => {
    const { data, error: failure } = await supabase.functions.invoke('marketing-photo-access', { body: { action: 'open', token } });
    if (failure) {
      const status = failure instanceof FunctionsHttpError ? failure.context.status : 0;
      throw new Error(status === 410 || !token ? 'El enlace venció o no es válido. Pedí un enlace nuevo al equipo de HI.' : 'No se pudieron cargar las fotos. Intentá nuevamente.');
    }
    setGallery(data as Gallery);
    return data as Gallery;
  }, [token]);
  useEffect(() => {
    setGallery(null); setZip(null); setSelected(null); setError('');
    void load().catch(e => setError(e.message));
  }, [load]);
  const download = async (photo: SharedPhoto) => {
    const response = await fetch(photo.signed_url, { referrerPolicy: 'no-referrer' });
    if (!response.ok) throw new Error('No se pudo descargar la foto. Intentá nuevamente.');
    return response.blob();
  };
  const prepareZip = async () => {
    setBusy(true); setError('');
    try {
      const fresh = await load();
      setZip(await buildMarketingZip(fresh.photos, photo => {
        const signed = fresh.photos.find(p => p.id === photo.id);
        if (!signed) throw new Error('Foto no disponible.');
        return download(signed);
      }));
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo preparar el ZIP.'); }
    finally { setBusy(false); }
  };
  const individual = async (photo: SharedPhoto, index: number) => {
    setBusy(true); setError('');
    try {
      const fresh = await load();
      const signed = fresh.photos.find(p => p.id === photo.id);
      if (!signed) throw new Error('Foto no disponible.');
      saveMarketingFile(await download(signed), photoFilename(signed, index));
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo descargar.'); }
    finally { setBusy(false); }
  };
  return <main className="min-h-screen bg-background text-foreground" data-sensitive>
    <header className="border-b border-border bg-card px-5 py-5"><div className="mx-auto max-w-6xl"><p className="text-sm font-semibold text-primary">Homie Inspection</p><h1 className="mt-2 text-2xl font-semibold">Fotos de comercialización</h1>{gallery && <p className="mt-2 text-muted-foreground">{gallery.property}</p>}</div></header>
    <section className="mx-auto max-w-6xl px-5 py-6">
      {error && <p role="alert" className="mb-4 text-destructive">{error}</p>}
      {!gallery && !error && <Loader2 aria-label="Cargando fotos" className="animate-spin text-primary" />}
      {gallery && <><div className="mb-6 flex flex-wrap items-center justify-between gap-4"><div><p className="flex items-center gap-2 font-medium"><Images className="h-4 w-4" />{gallery.photos.length} fotos</p><p className="mt-1 text-sm text-muted-foreground">Disponible hasta {new Date(gallery.expires_at).toLocaleString('es')}</p></div><Button disabled={busy} onClick={() => zip ? saveMarketingFile(zip, 'fotos-comercializacion.zip') : void prepareZip()}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}{zip ? 'Descargar ZIP' : busy ? 'Preparando…' : 'Preparar ZIP'}</Button></div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">{gallery.photos.map((photo, index) => <article key={photo.id} className="min-w-0"><Button variant="ghost" className="h-auto w-full overflow-hidden rounded-md bg-muted p-0" aria-label={`Ampliar foto ${index + 1}`} onClick={() => setSelected(photo)}><img src={photo.signed_url} referrerPolicy="no-referrer" alt={`Foto ${index + 1}`} className="aspect-[4/3] w-full object-contain" /></Button><div className="mt-1 flex items-center justify-between gap-2"><span className="text-sm text-muted-foreground">Foto {index + 1}</span><Button variant="ghost" size="icon" disabled={busy} aria-label={`Descargar foto ${index + 1}`} title="Descargar foto" onClick={() => void individual(photo, index)}><Download className="h-4 w-4" /></Button></div></article>)}</div></>}
    </section>
    <Dialog open={!!selected} onOpenChange={open => { if (!open) setSelected(null); }}><DialogContent className="max-w-5xl"><DialogTitle>Foto de comercialización</DialogTitle>{selected && <img src={selected.signed_url} referrerPolicy="no-referrer" alt="Foto ampliada" className="max-h-[75vh] w-full object-contain" />}</DialogContent></Dialog>
  </main>;
}