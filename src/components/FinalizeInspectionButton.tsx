/**
 * "Finalizar inspección" action, available to Executive and Admin.
 *
 * Terminal transition: `approved`/`accepted` → `sent` ("Finalizado").
 * Requires `quien_repara` to be defined (the dialog lets the user set it
 * inline when missing). Backed by the `finalize_inspection` RPC, which
 * validates the role and writes to `inspection_audit_log`.
 */
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle2 } from 'lucide-react';
import { QUIEN_REPARA_LABELS, QUIEN_REPARA_VALUES, type QuienRepara } from '@/lib/quien-repara';
import { toast } from '@/hooks/use-toast';

interface Props {
  inspectionId: string;
  status: string | null | undefined;
  quienRepara: QuienRepara | null | undefined;
  onFinalized?: () => void;
  variant?: 'default' | 'outline';
  size?: 'default' | 'sm' | 'lg';
}

const FINALIZABLE = new Set(['approved', 'accepted']);

export function FinalizeInspectionButton({
  inspectionId, status, quienRepara, onFinalized, variant = 'default', size = 'default',
}: Props) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [flag, setFlag] = useState<QuienRepara | null>(quienRepara ?? null);
  const [submitting, setSubmitting] = useState(false);

  if (!status || !FINALIZABLE.has(status)) return null;

  const canSubmit = !submitting && !!flag;

  const handleSubmit = async () => {
    if (!flag) return;
    setSubmitting(true);
    try {
      if (flag !== quienRepara) {
        const { error } = await supabase
          .from('inspections')
          .update({ quien_repara: flag })
          .eq('id', inspectionId);
        if (error) throw error;
      }
      const { data, error } = await supabase.rpc('finalize_inspection' as any, {
        p_inspection_id: inspectionId,
        p_note: note.trim() || null,
      });
      if (error) throw error;
      const result = (data as any)?.status;
      toast({
        title: result === 'noop' ? 'Sin cambios' : 'Inspección finalizada',
        description: result === 'noop'
          ? 'La inspección ya estaba finalizada.'
          : 'El caso quedó en estado Finalizado.',
      });
      setOpen(false);
      setNote('');
      onFinalized?.();
    } catch (e: any) {
      const msg = String(e?.message ?? '');
      toast({
        variant: 'destructive',
        title: 'No se pudo finalizar',
        description: msg.includes('not_authorized')
          ? 'No tienes permisos para finalizar esta inspección.'
          : msg.includes('invalid_status')
            ? 'La inspección debe estar aprobada para finalizarse.'
            : msg || 'Error inesperado.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button variant={variant} size={size} className="gap-2" onClick={() => setOpen(true)}>
        <CheckCircle2 className="h-4 w-4" /> Finalizar inspección
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finalizar inspección</DialogTitle>
            <DialogDescription>
              El caso pasará a estado <strong>Finalizado</strong>. Esta acción queda registrada en el historial.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>¿Quién repara?</Label>
              <RadioGroup
                value={flag ?? ''}
                onValueChange={(v) => setFlag(v as QuienRepara)}
                className="space-y-1.5"
              >
                {QUIEN_REPARA_VALUES.map((value) => (
                  <div key={value} className="flex items-center gap-2">
                    <RadioGroupItem value={value} id={`finalize-qr-${value}`} />
                    <Label htmlFor={`finalize-qr-${value}`} className="font-normal cursor-pointer">
                      {QUIEN_REPARA_LABELS[value]}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label htmlFor="finalize-note">Nota (opcional)</Label>
              <Textarea
                id="finalize-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Contexto del cierre operativo"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={!canSubmit}>
              {submitting ? 'Finalizando...' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default FinalizeInspectionButton;
