/**
 * Manual closure dialog for the owner-feedback loop.
 *
 * Used when the propietario never responds to the published report, or when
 * the approval was coordinated off-platform (WhatsApp, call, email). The
 * executive picks a reason, optionally adds a note, and the inspection
 * transitions to `approved` with `owner_feedback_status='accepted'`.
 *
 * Backed by the `executive_force_close_owner_feedback` RPC, which records
 * a synthetic submission row and writes to `inspection_audit_log`.
 */
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { AlertCallout } from '@/shared/ui/AlertCallout';
import { toast } from '@/hooks/use-toast';

type Reason = 'no_response' | 'coordinated_offline' | 'other';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inspectionId: string;
  onClosed?: () => void;
}

export function ManualCloseOwnerFeedbackDialog({ open, onOpenChange, inspectionId, onClosed }: Props) {
  const [reason, setReason] = useState<Reason>('no_response');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const noteRequired = reason === 'other';
  const canSubmit = !submitting && (!noteRequired || note.trim().length > 0);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('executive_force_close_owner_feedback' as any, {
        p_inspection_id: inspectionId,
        p_reason: reason,
        p_note: note.trim() || null,
      });
      if (error) throw error;
      const status = (data as any)?.status;
      if (status === 'noop') {
        toast({ title: 'Sin cambios', description: 'La inspección ya estaba cerrada.' });
      } else {
        toast({ title: 'Cierre manual registrado', description: 'La inspección quedó como aprobada.' });
      }
      onOpenChange(false);
      setNote('');
      setReason('no_response');
      onClosed?.();
    } catch (e: any) {
      toast({ title: 'No se pudo cerrar', description: e?.message ?? 'Error desconocido', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cerrar feedback del propietario manualmente</DialogTitle>
          <DialogDescription>
            Marca la inspección como aprobada cuando el propietario no respondió o la aprobación se gestionó fuera de la plataforma.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Motivo</Label>
            <RadioGroup value={reason} onValueChange={(v) => setReason(v as Reason)}>
              <div className="flex items-start gap-2">
                <RadioGroupItem value="no_response" id="r-no-response" className="mt-0.5" />
                <Label htmlFor="r-no-response" className="font-normal cursor-pointer">
                  Sin respuesta del propietario
                </Label>
              </div>
              <div className="flex items-start gap-2">
                <RadioGroupItem value="coordinated_offline" id="r-offline" className="mt-0.5" />
                <Label htmlFor="r-offline" className="font-normal cursor-pointer">
                  Aprobado fuera de la plataforma (WhatsApp, correo, llamada)
                </Label>
              </div>
              <div className="flex items-start gap-2">
                <RadioGroupItem value="other" id="r-other" className="mt-0.5" />
                <Label htmlFor="r-other" className="font-normal cursor-pointer">
                  Otro
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="manual-close-note">
              Nota interna {noteRequired && <span className="text-destructive">*</span>}
            </Label>
            <Textarea
              id="manual-close-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={noteRequired ? 'Describe el motivo del cierre' : 'Detalles adicionales (opcional)'}
              rows={3}
            />
          </div>

          <AlertCallout tone="warning">
            Esto marcará la inspección como aprobada y quedará registrado en el historial. No envía notificación al propietario.
          </AlertCallout>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? 'Cerrando…' : 'Confirmar cierre'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
