/**
 * Visor de foto con zoom (rueda, doble clic, teclado + − 0), arrastre cuando
 * está ampliada y navegación opcional entre fotos.
 *
 * Compartido por el panel de fotos de la revisión ejecutiva y el comparador de
 * inmuebles, para que el zoom se comporte igual en toda la app.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

export interface ZoomableImageProps {
  src: string;
  alt: string;
  /** Cambiar esta clave reinicia zoom y desplazamiento. */
  photoKey: string;
  showNav?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  /** Alto máximo del contenedor (por defecto 75vh). */
  maxHeightClass?: string;
}

export function ZoomableImage({
  src, alt, photoKey, showNav = false, onPrev, onNext, maxHeightClass = 'max-h-[75vh]',
}: ZoomableImageProps) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const reset = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  // Reset when photo changes
  useEffect(() => { reset(); }, [photoKey, reset]);

  const zoomAt = useCallback((nextScale: number, cx?: number, cy?: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const clamped = clampScale(nextScale);
    setScale((prev) => {
      if (!rect || cx === undefined || cy === undefined) {
        if (clamped === 1) setOffset({ x: 0, y: 0 });
        return clamped;
      }
      // Zoom towards cursor: keep the point under cursor stationary
      const px = cx - rect.left - rect.width / 2;
      const py = cy - rect.top - rect.height / 2;
      setOffset((o) => {
        const ratio = clamped / prev;
        const nx = px - (px - o.x) * ratio;
        const ny = py - (py - o.y) * ratio;
        return clamped === 1 ? { x: 0, y: 0 } : { x: nx, y: ny };
      });
      return clamped;
    });
  }, []);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    zoomAt(scale * factor, e.clientX, e.clientY);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (scale > 1) reset();
    else zoomAt(2.5, e.clientX, e.clientY);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (scale <= 1) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging || !dragStart.current) return;
    setOffset({
      x: dragStart.current.ox + (e.clientX - dragStart.current.x),
      y: dragStart.current.oy + (e.clientY - dragStart.current.y),
    });
  };

  const handlePointerUp = () => {
    setDragging(false);
    dragStart.current = null;
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomAt(scale * 1.25); }
      else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomAt(scale / 1.25); }
      else if (e.key === '0') { e.preventDefault(); reset(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [scale, zoomAt, reset]);

  const zoomed = scale > 1;

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className={cn(
          'relative w-full overflow-hidden rounded-lg bg-muted/30 select-none',
          maxHeightClass,
          zoomed ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in',
        )}
        style={{ aspectRatio: '4 / 3' }}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <img
          src={src}
          alt={alt}
          decoding="async"
          draggable={false}
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: 'center center',
            transition: dragging ? 'none' : 'transform 120ms ease-out',
          }}
        />
      </div>

      {showNav && !zoomed && (
        <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 flex justify-between px-2 pointer-events-none">
          <Button
            variant="secondary" size="icon"
            className="h-9 w-9 rounded-full pointer-events-auto"
            onClick={onPrev}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="secondary" size="icon"
            className="h-9 w-9 rounded-full pointer-events-auto"
            onClick={onNext}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Zoom controls */}
      <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-background/90 backdrop-blur border border-border/60 rounded-full px-1.5 py-1 shadow-sm">
        <Button
          type="button" variant="ghost" size="icon"
          className="h-7 w-7 rounded-full"
          onClick={() => zoomAt(scale / 1.25)}
          disabled={scale <= MIN_SCALE}
          title="Alejar (−)"
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <span className="text-tiny tabular-nums w-10 text-center text-muted-foreground">
          {Math.round(scale * 100)}%
        </span>
        <Button
          type="button" variant="ghost" size="icon"
          className="h-7 w-7 rounded-full"
          onClick={() => zoomAt(scale * 1.25)}
          disabled={scale >= MAX_SCALE}
          title="Acercar (+)"
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button" variant="ghost" size="icon"
          className="h-7 w-7 rounded-full"
          onClick={reset}
          disabled={scale === 1 && offset.x === 0 && offset.y === 0}
          title="Restablecer (0)"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export default ZoomableImage;
