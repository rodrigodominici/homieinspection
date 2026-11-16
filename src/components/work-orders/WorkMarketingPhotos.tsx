import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import SignedPhotoImg from '@/components/SignedPhotoImg';
import { supabase } from '@/integrations/supabase/client';
import { uploadInspectionPhotos } from '@/shared/lib/inspection-photos';
import { useAuth } from '@/contexts/AuthContext';

/** Fotos de comercialización opcionales tomadas al revisar los trabajos del contratista. Solo quedan en HI. */
export default function WorkMarketingPhotos({ inspectionId }: { inspectionId: string }) {
  const { profile } = useAuth();
  const [photos, setPhotos] = useState<{ id: string; storage_path: string; sort_order: number }[]>([]);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('inspection_photos').select('id,storage_path,sort_order')
      .eq('inspection_id', inspectionId).eq('photo_stage', 'marketing_work').order('sort_order');
    setPhotos(data ?? []);
  }, [inspectionId]);
  useEffect(() => { void load(); }, [load]);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const { data: sec } = await supabase.from('inspection_sections').select('id,section_key')
        .eq('inspection_id', inspectionId).order('sort_order').limit(1).maybeSingle();
      if (!sec) throw new Error('Sin secciones');
      await uploadInspectionPhotos({
        inspectionId, sectionId: sec.id, sectionKey: 'marketing_work', files,
        uploadedBy: profile?.id, startingSortOrder: photos.length, photoStage: 'marketing_work',
      });
      toast.success('Fotos guardadas');
      await load();
    } catch {
      toast.error('No se pudieron subir las fotos');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="space-y-2 border-t pt-3">
      <Label>Fotos de comercialización (opcional) · {photos.length}</Label>
      <p className="text-xs text-muted-foreground">Se guardan solo en HI. No aparecen en el informe del propietario.</p>
      {photos.length > 0 && (
        <div className="grid grid-cols-6 gap-2">
          {photos.map((p) => (
            <SignedPhotoImg key={p.id} url="" storagePath={p.storage_path} alt="Foto de comercialización" loading="lazy"
              className="aspect-square w-full rounded-md object-cover bg-muted" />
          ))}
        </div>
      )}
      <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void onFiles(e.target.files)} />
      <Button variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Camera className="h-4 w-4 mr-2" />} Agregar fotos
      </Button>
    </div>
  );
}
