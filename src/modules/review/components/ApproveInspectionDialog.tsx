import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import type { InspectionSection } from '@/lib/types';

interface Props {
  operationalSections: InspectionSection[];
  disabled: boolean;
  onApprove: () => void;
}

export function ApproveInspectionDialog({ operationalSections, disabled, onApprove }: Props) {
  const pending = operationalSections.filter(s => s.status !== 'reviewed' && s.status !== 'completed');

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" className="bg-[hsl(var(--status-good))] hover:bg-[hsl(var(--status-good))]/90" disabled={disabled}>
          <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Aprobar
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Aprobar inspección?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              {pending.length === 0 ? (
                <div className="flex items-start gap-2 rounded-md border border-[hsl(var(--status-good))]/30 bg-[hsl(var(--status-good-bg))] p-3 text-[hsl(var(--status-good-fg))]">
                  <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>Todas las secciones están revisadas. Listo para aprobar.</span>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-start gap-2 rounded-md border border-[hsl(var(--status-pending-bg))] bg-[hsl(var(--status-pending-bg))] p-3 text-[hsl(var(--status-pending-fg))]">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>{pending.length} {pending.length === 1 ? 'sección sigue pendiente' : 'secciones siguen pendientes'} de revisión.</span>
                  </div>
                  <ul className="text-xs list-disc pl-5 max-h-32 overflow-y-auto">
                    {pending.slice(0, 8).map(p => <li key={p.id}>{p.section_title}</li>)}
                    {pending.length > 8 && <li className="opacity-70">+{pending.length - 8} más</li>}
                  </ul>
                </div>
              )}
              <p className="text-xs text-muted-foreground">Al aprobar, todas las secciones quedarán marcadas como revisadas y la inspección lista para publicar.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onApprove}>Aprobar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
