import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Camera, Download, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ZoomableImage } from './ZoomableImage';
import { useSignedPhotoUrls } from '@/lib/photo-urls';
import { buildMarketingZip, fetchMarketingPhoto, photoFilename, saveMarketingFile, type MarketingPhoto } from '@/lib/marketing-photo-download';

export function AssignedMarketingGallery({ checkinId, captacionId, propertyId }: { checkinId?: string; captacionId?: string; propertyId: string }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const [ready, setReady] = useState<{ blob: Blob; name: string } | null>(null);
  const { data: photos = [], isLoading, error, refetch } = useQuery({
    queryKey: ['assigned-marketing', checkinId, captacionId],
    enabled: open,
    queryFn: async () => {
      if (!captacionId && !checkinId) throw new Error('Inmueble no encontrado');
      const { data, error } = captacionId
        ? await supabase.rpc('get_hunter_marketing_photos', { p_captacion_id: captacionId })
        : await supabase.rpc('get_assigned_marketing_photos', { p_checkin_id: checkinId ?? '' });
      if (error) throw error;
      return (data ?? []) as unknown as MarketingPhoto[];
    },
  });
  const urlOf = useSignedPhotoUrls(open ? photos : []);
  const active = selected === null ? undefined : photos[selected];
  const prepare = async (index?: number) => {
    setBusy(true); setDownloadError(''); setReady(null);
    try {
      const photo = index === undefined ? undefined : photos[index];
      const blob = photo ? await fetchMarketingPhoto(photo) : await buildMarketingZip(photos);
      const name = photo && index !== undefined ? photoFilename(photo, index) : `fotos-comercializacion-${propertyId.replace(/[^a-zA-Z0-9_-]/g, '-')}.zip`;
      setReady({ blob, name });
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : 'No se pudo preparar la descarga.');
    } finally { setBusy(false); }
  };
  return <section className="space-y-3">
    <Button variant="outline" className="w-full gap-2" onClick={() => setOpen(true)}><Camera className="h-4 w-4" />Fotos de comercialización</Button>
    <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) { setSelected(null); setReady(null); } }}>
      <DialogContent className="max-w-5xl w-[calc(100%-2rem)] max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Fotos de comercialización</DialogTitle><DialogDescription>{propertyId} · {photos.length} fotos</DialogDescription></DialogHeader>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy || !photos.length} onClick={() => void prepare()}><Download className="mr-2 h-4 w-4" />Preparar ZIP</Button>
          <Button variant="ghost" size="icon" title="Actualizar fotos" aria-label="Actualizar fotos" disabled={busy} onClick={() => { setReady(null); void refetch(); }}><RefreshCw className="h-4 w-4" /></Button>
          {busy && <span role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Preparando descarga…</span>}
          {ready && <Button onClick={() => saveMarketingFile(ready.blob, ready.name)}><Download className="mr-2 h-4 w-4" />Descargar {ready.name.endsWith('.zip') ? 'ZIP' : 'foto'}</Button>}
        </div>
        {(error || downloadError) && <div role="alert" className="text-destructive text-sm">{downloadError || 'No se pudieron cargar las fotos.'}<Button variant="link" onClick={() => void refetch()}>Reintentar</Button></div>}
        {isLoading ? <p role="status">Cargando fotos…</p> : !error && !photos.length ? <p className="text-muted-foreground py-8 text-center">Todavía no hay fotos de comercialización para este inmueble.</p> : active ? <div className="space-y-3">
          <Button variant="ghost" onClick={() => setSelected(null)}>Volver a todas las fotos</Button>
          <ZoomableImage src={urlOf(active.id)} alt={active.caption || 'Foto de comercialización'} photoKey={active.id} showNav={photos.length > 1} onPrev={() => setSelected((index) => ((index ?? 0) - 1 + photos.length) % photos.length)} onNext={() => setSelected((index) => ((index ?? 0) + 1) % photos.length)} maxHeightClass="max-h-[55vh]" />
          <Button variant="outline" disabled={busy} onClick={() => void prepare(selected ?? 0)}><Download className="mr-2 h-4 w-4" />Preparar foto</Button>
        </div> : <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {photos.map((photo, index) => <article key={photo.id} className="space-y-2">
            <Button variant="ghost" className="w-full h-auto p-0 aspect-[4/3] bg-muted overflow-hidden" aria-label={`Ver foto ${index + 1}`} onClick={() => setSelected(index)}>{urlOf(photo.id) ? <img src={urlOf(photo.id)} alt={photo.caption || `Foto ${index + 1}`} className="h-full w-full object-contain" /> : <Loader2 className="h-5 w-5 animate-spin" />}</Button>
            <div className="flex items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{new Date(photo.captacion_date).toLocaleDateString('es')} · Foto {index + 1}</span><Button variant="ghost" size="icon" aria-label={`Preparar foto ${index + 1}`} title="Descargar foto" disabled={busy} onClick={() => void prepare(index)}><Download className="h-4 w-4" /></Button></div>
          </article>)}
        </div>}
      </DialogContent>
    </Dialog>
  </section>;
}