import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';

interface RequestChangesPanelProps {
  selectedCount: number;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function RequestChangesPanel({ selectedCount, submitting, onCancel, onConfirm }: RequestChangesPanelProps) {
  return (
    <div className="hidden lg:flex items-center gap-3 h-10 border-t">
      <span className="text-caption text-muted-foreground">Selecciona secciones a devolver</span>
      <div className="flex-1" />
      <Button variant="outline" size="sm" onClick={onCancel}>Cancelar</Button>
      <Button variant="destructive" size="sm" onClick={onConfirm} disabled={submitting}>
        <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Devolver ({selectedCount})
      </Button>
    </div>
  );
}
