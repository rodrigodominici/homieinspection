import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AlertTriangle } from 'lucide-react';
import type { InspectionSection } from '@/lib/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  missingSections: InspectionSection[];
  onConfirm: () => void;
}

export function MissingObservationsDialog({ open, onOpenChange, missingSections, onConfirm }: Props) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-[hsl(var(--status-regular))]" />
            Hay {missingSections.length} {missingSections.length === 1 ? 'sección' : 'secciones'} sin observación final
          </AlertDialogTitle>
          <AlertDialogDescription>
            Puedes publicar de todas formas. Las fotos de esas secciones se incluirán normalmente en el reporte.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {missingSections.length > 0 && (
          <div className="max-h-40 overflow-y-auto rounded-md border bg-muted/30 px-3 py-2 text-caption space-y-0.5">
            {missingSections.map((s) => (
              <p key={s.id} className="text-muted-foreground">· {s.section_title}</p>
            ))}
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={() => { onOpenChange(false); onConfirm(); }}>
            Publicar de todas formas
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
