import { useEffect, useRef, useState } from 'react';
import { X, Check } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  onDone: (files: File[]) => void;
  /** Called when the in-app camera can't start, so the caller can fall back. */
  onUnavailable: () => void;
}

/** Full-screen in-app camera that lets the user shoot many photos in a row. */
export default function ContinuousCamera({ open, onClose, onDone, onUnavailable }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [shots, setShots] = useState<{ file: File; url: string }[]>([]);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch {
        if (!cancelled) onUnavailable();
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [open, onUnavailable]);

  const reset = () => {
    shots.forEach((s) => URL.revokeObjectURL(s.url));
    setShots([]);
  };

  const capture = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext('2d')?.drawImage(v, 0, 0);
    setFlash(true);
    setTimeout(() => setFlash(false), 120);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `foto-${Date.now()}.jpg`, { type: 'image/jpeg' });
      setShots((s) => [...s, { file, url: URL.createObjectURL(blob) }]);
    }, 'image/jpeg', 0.9);
  };

  const finish = () => {
    const files = shots.map((s) => s.file);
    reset();
    if (files.length) onDone(files);
    onClose();
  };

  const cancel = () => { reset(); onClose(); };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-foreground flex flex-col">
      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted className="absolute inset-0 w-full h-full object-cover" />
        {flash && <div className="absolute inset-0 bg-background/70" />}
        <button
          type="button" onClick={cancel} aria-label="Cerrar cámara"
          className="absolute top-4 left-4 h-10 w-10 rounded-full bg-background/80 flex items-center justify-center"
        >
          <X className="h-5 w-5" />
        </button>
        {shots.length > 0 && (
          <span className="absolute top-5 right-4 px-3 py-1 rounded-full bg-background/80 text-caption font-medium">
            {shots.length} {shots.length === 1 ? 'foto' : 'fotos'}
          </span>
        )}
      </div>

      {shots.length > 0 && (
        <div className="flex gap-2 overflow-x-auto px-3 py-2 bg-foreground">
          {shots.map((s, i) => (
            <div key={s.url} className="relative shrink-0">
              <img src={s.url} alt="" className="h-14 w-14 rounded-md object-cover" />
              <button
                type="button" aria-label="Quitar foto"
                onClick={() => {
                  URL.revokeObjectURL(s.url);
                  setShots((arr) => arr.filter((_, j) => j !== i));
                }}
                className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between px-8 py-5 bg-foreground" style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}>
        <div className="w-16" />
        <button
          type="button" onClick={capture} aria-label="Sacar foto"
          className="h-18 w-18 h-[72px] w-[72px] rounded-full border-4 border-background bg-background/90 active:scale-95 transition-transform"
        />
        <button
          type="button" onClick={finish} disabled={shots.length === 0}
          className="w-16 h-11 rounded-full bg-primary text-primary-foreground flex items-center justify-center gap-1 text-caption font-medium disabled:opacity-40"
        >
          <Check className="h-4 w-4" /> Listo
        </button>
      </div>
    </div>
  );
}
