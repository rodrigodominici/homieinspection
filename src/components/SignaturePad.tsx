import { useRef, useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Eraser, Check, X, AlertTriangle } from 'lucide-react';

interface SignaturePadProps {
  onConfirm: (data: {
    signature_data: string | null;
    signature_status: 'signed' | 'refused' | 'unavailable';
    signer_name: string;
    skip_reason: string | null;
  }) => void | Promise<void>;
  onCancel: () => void;
  /** When true, shows a warning that confirming will overwrite the existing signature. */
  hasExistingSignature?: boolean;
}

export default function SignaturePad({ onConfirm, onCancel, hasExistingSignature = false }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [signerName, setSignerName] = useState('');
  const [mode, setMode] = useState<'sign' | 'skip'>('sign');
  const [skipStatus, setSkipStatus] = useState<'refused' | 'unavailable'>('refused');
  const [skipReason, setSkipReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const getCtx = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    return { canvas, ctx };
  }, []);

  useEffect(() => {
    const result = getCtx();
    if (!result) return;
    const { canvas, ctx } = result;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = 'hsl(220, 26%, 14%)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, [getCtx]);

  const getPos = (e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  };

  const startDraw = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    const result = getCtx();
    if (!result) return;
    const pos = getPos(e);
    result.ctx.beginPath();
    result.ctx.moveTo(pos.x, pos.y);
    setIsDrawing(true);
  };

  const draw = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const result = getCtx();
    if (!result) return;
    const pos = getPos(e);
    result.ctx.lineTo(pos.x, pos.y);
    result.ctx.stroke();
    setHasDrawn(true);
  };

  const endDraw = () => setIsDrawing(false);

  const clearCanvas = () => {
    const result = getCtx();
    if (!result) return;
    const { canvas, ctx } = result;
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    setHasDrawn(false);
  };

  const handleConfirm = () => {
    if (mode === 'sign') {
      if (!hasDrawn || !signerName.trim()) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dataUrl = canvas.toDataURL('image/png');
      onConfirm({
        signature_data: dataUrl,
        signature_status: 'signed',
        signer_name: signerName.trim(),
        skip_reason: null,
      });
    } else {
      if (!skipReason.trim()) return;
      onConfirm({
        signature_data: null,
        signature_status: skipStatus,
        signer_name: signerName.trim() || '',
        skip_reason: skipReason.trim(),
      });
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border-0 ring-1 ring-border shadow-sm rounded-2xl">
        <CardContent className="p-4 space-y-4">
          <h3 className="text-body-lg font-semibold">Firma del Inquilino</h3>

          {/* Mode toggle */}
          <div className="flex gap-2">
            <Button variant={mode === 'sign' ? 'default' : 'outline'} size="sm" onClick={() => setMode('sign')}>
              Firmar
            </Button>
            <Button variant={mode === 'skip' ? 'default' : 'outline'} size="sm" onClick={() => setMode('skip')}>
              No puede firmar
            </Button>
          </div>

          {/* Signer name */}
          <div className="space-y-2">
            <Label>Nombre del inquilino</Label>
            <Input value={signerName} onChange={(e) => setSignerName(e.target.value)}
              placeholder="Nombre completo" />
          </div>

          {mode === 'sign' ? (
            <>
              <div className="space-y-2">
                <Label>Firma</Label>
                <div className="relative rounded-xl border-2 border-dashed border-border bg-card">
                  <canvas
                    ref={canvasRef}
                    className="w-full touch-none cursor-crosshair"
                    style={{ height: 200 }}
                    onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
                    onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
                  />
                  {!hasDrawn && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span className="text-caption text-muted-foreground">Firmar aquí</span>
                    </div>
                  )}
                </div>
                <Button variant="ghost" size="sm" onClick={clearCanvas} className="gap-1.5">
                  <Eraser className="h-3.5 w-3.5" /> Limpiar
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Razón</Label>
                <Select value={skipStatus} onValueChange={(v) => setSkipStatus(v as 'refused' | 'unavailable')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="refused">Se negó a firmar</SelectItem>
                    <SelectItem value="unavailable">No presente / no disponible</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Nota (obligatoria)</Label>
                <Textarea value={skipReason} onChange={(e) => setSkipReason(e.target.value)}
                  placeholder="Detalle la situación..." rows={3} />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button variant="outline" onClick={onCancel} className="flex-1 h-12 rounded-xl">
          <X className="mr-2 h-4 w-4" /> Cancelar
        </Button>
        <Button
          onClick={handleConfirm}
          className="flex-1 h-12 rounded-xl"
          disabled={mode === 'sign' ? (!hasDrawn || !signerName.trim()) : !skipReason.trim()}
        >
          <Check className="mr-2 h-4 w-4" /> Confirmar
        </Button>
      </div>
    </div>
  );
}
