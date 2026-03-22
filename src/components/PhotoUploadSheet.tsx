import { useRef, useState, useCallback } from 'react';
import { Camera, Image, FileUp, Plus } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

interface Props {
  onFiles: (files: FileList) => void;
  disabled?: boolean;
}

export default function PhotoUploadSheet({ onFiles, disabled }: Props) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.length) {
        onFiles(e.target.files);
        setOpen(false);
      }
      e.target.value = '';
    },
    [onFiles],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files?.length) onFiles(e.dataTransfer.files);
    },
    [onFiles],
  );

  // Hidden inputs — each with different capture/accept behaviour
  const hiddenInputs = (
    <>
      {/* Camera only */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        onChange={handleChange}
        className="hidden"
      />
      {/* Gallery (no capture attr → opens picker on mobile) */}
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleChange}
        className="hidden"
      />
      {/* Any file */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*,.pdf,.heic"
        multiple
        onChange={handleChange}
        className="hidden"
      />
    </>
  );

  // ── Mobile: bottom sheet action list ──
  if (isMobile) {
    return (
      <>
        {hiddenInputs}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              className="aspect-square rounded-2xl border-2 border-dashed border-border flex flex-col items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors disabled:opacity-40"
            >
              <Plus className="h-6 w-6 text-muted-foreground" />
              <span className="text-tiny text-muted-foreground mt-1">Añadir</span>
            </button>
          </SheetTrigger>

          <SheetContent side="bottom" className="rounded-t-2xl px-4 pb-8 pt-4">
            <SheetHeader className="mb-4">
              <SheetTitle className="text-body">Agregar fotos</SheetTitle>
            </SheetHeader>

            <div className="space-y-1">
              <ActionRow
                icon={Camera}
                label="Tomar foto"
                onClick={() => cameraRef.current?.click()}
              />
              <ActionRow
                icon={Image}
                label="Elegir de galería"
                onClick={() => galleryRef.current?.click()}
              />
              <ActionRow
                icon={FileUp}
                label="Seleccionar archivo"
                onClick={() => fileRef.current?.click()}
              />
            </div>
          </SheetContent>
        </Sheet>
      </>
    );
  }

  // ── Desktop: drag-and-drop zone + file picker ──
  return (
    <>
      {hiddenInputs}
      <button
        type="button"
        disabled={disabled}
        onClick={() => galleryRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`aspect-square rounded-2xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-colors disabled:opacity-40 ${
          dragOver ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
        }`}
      >
        <Plus className="h-6 w-6 text-muted-foreground" />
        <span className="text-tiny text-muted-foreground mt-1">Añadir</span>
      </button>
    </>
  );
}

function ActionRow({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl text-body font-medium hover:bg-muted/60 active:bg-muted transition-colors"
    >
      <Icon className="h-5 w-5 text-muted-foreground" />
      {label}
    </button>
  );
}
