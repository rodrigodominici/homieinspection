import { memo, useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Camera, ChevronLeft, ChevronRight, Eye, EyeOff, Plus, Trash2, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { InspectionPhoto } from '@/lib/types';

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

interface PhotoPanelProps {
  photos: InspectionPhoto[];
  inspectionId: string;
  sectionId: string;
  sectionKey: string;
  uploadedBy?: string;
  /** Signed URL resolver — lifted to parent so remounts (aside <-> workspace
   *  slot when repairs panel toggles) don't re-fetch / lose URLs. */
  urlOf: (photoId: string) => string;
  onToggleVisibility: (photo: InspectionPhoto) => void;
  onPhotosChanged: (next: InspectionPhoto[]) => void;
}

/** Right-side photo panel for the Executive review workstation. */
export const PhotoPanel = memo(function PhotoPanel({
  photos, inspectionId, sectionId, sectionKey, uploadedBy, urlOf,
  onToggleVisibility, onPhotosChanged,
}: PhotoPanelProps) {
  const { toast } = useToast();
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    // Convert to Array immediately — before any await — so the live FileList
    // reference isn't emptied when the input is cleared (e.target.value = '').
    const fileArray = Array.from(files);
    setUploading(true);
    try {
      const { uploadInspectionPhotos } = await import('@/shared/lib/inspection-photos');
      const inserted = await uploadInspectionPhotos({
        inspectionId, sectionId, sectionKey, files: fileArray, uploadedBy,
        startingSortOrder: photos.length,
      });
      onPhotosChanged([...photos, ...inserted]);
    } catch (e) {
      const { photoUploadErrorLabel } = await import('@/shared/lib/inspection-photos');
      const { title, description } = photoUploadErrorLabel(e);
      toast({ title, description, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (photo: InspectionPhoto) => {
    try {
      const { deleteInspectionPhoto } = await import('@/shared/lib/inspection-photos');
      await deleteInspectionPhoto(photo);
      onPhotosChanged(photos.filter((p) => p.id !== photo.id));
      toast({ title: 'Foto eliminada' });
    } catch (e: any) {
      toast({ title: 'No se pudo eliminar', description: e?.message ?? '', variant: 'destructive' });
    } finally {
      setConfirmDeleteId(null);
    }
  };

  const featured = lightboxIdx !== null ? photos[lightboxIdx] : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-tiny font-medium text-muted-foreground uppercase tracking-wider">
          Fotos {photos.length > 0 && <span className="ml-1 normal-case tracking-normal text-muted-foreground/80">· {photos.length}</span>}
        </p>
        <input
          ref={fileRef} type="file" accept="image/*" multiple className="hidden"
          onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
        />
        <Button
          type="button" variant="ghost" size="sm"
          className="h-7 px-2 text-xs gap-1"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          <Plus className="h-3.5 w-3.5" />
          {uploading ? 'Subiendo…' : 'Subir'}
        </Button>
      </div>

      {photos.length === 0 ? (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="w-full aspect-[4/3] rounded-lg border-2 border-dashed border-border/70 flex flex-col items-center justify-center text-muted-foreground hover:bg-muted/40 transition-colors"
        >
          <Camera className="h-5 w-5 mb-1" />
          <span className="text-xs">Agregar foto</span>
        </button>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {photos.map((p, idx) => {
            const visible = (p as any).visible_to_owner !== false;
            return (
              <div key={p.id} className="relative group">
                <button
                  type="button"
                  onClick={() => setLightboxIdx(idx)}
                  className={cn(
                    'block w-full aspect-[4/3] rounded-lg overflow-hidden border border-border/60',
                    !visible && 'opacity-40',
                  )}
                >
                  <img
                    src={urlOf(p.id)}
                    alt={p.caption ?? ''}
                    loading="lazy"
                    decoding="async"
                    width={400}
                    height={300}
                    className="w-full h-full object-cover"
                  />
                </button>
                <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onToggleVisibility(p); }}
                    title={visible ? 'Ocultar al propietario' : 'Mostrar al propietario'}
                    className="p-1 rounded-md bg-background/90 hover:bg-background border border-border/60"
                  >
                    {visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3 text-muted-foreground" />}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(p.id); }}
                    title="Eliminar foto"
                    className="p-1 rounded-md bg-background/90 hover:bg-destructive hover:text-destructive-foreground border border-border/60"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                {p.caption && (
                  <p className="text-tiny text-muted-foreground mt-0.5 truncate">{p.caption}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Lightbox */}
      <Dialog open={lightboxIdx !== null} onOpenChange={(o) => { if (!o) setLightboxIdx(null); }}>
        <DialogContent className="max-w-4xl p-2">
          <DialogHeader>
            <DialogTitle className="text-caption">
              {featured && (
                <>Foto {(lightboxIdx ?? 0) + 1} de {photos.length}
                  {featured.caption && ` — ${featured.caption}`}
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          {featured && (
            <ZoomableImage
              src={urlOf(featured.id)}
              alt={featured.caption ?? ''}
              photoKey={featured.id}
              showNav={photos.length > 1}
              onPrev={() => setLightboxIdx((i) => (i! > 0 ? i! - 1 : photos.length - 1))}
              onNext={() => setLightboxIdx((i) => (i! < photos.length - 1 ? i! + 1 : 0))}
            />
          )}
        </DialogContent>
      </Dialog>



      <AlertDialog open={confirmDeleteId !== null} onOpenChange={(o) => { if (!o) setConfirmDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar foto</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. La foto se eliminará del reporte.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const target = photos.find((p) => p.id === confirmDeleteId);
                if (target) void handleDelete(target);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
});
