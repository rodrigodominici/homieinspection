import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

interface SubmittedBannerProps {
  submitting: boolean;
  onStartReview: () => void;
}

export function SubmittedBanner({ submitting, onStartReview }: SubmittedBannerProps) {
  return (
    <div className="sticky top-[3.5rem] z-20 border-b bg-[hsl(var(--status-pending-bg))] text-[hsl(var(--status-pending-fg))]">
      <div className="px-4 lg:px-6 py-2.5 flex items-center gap-3">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Esta inspección está lista para tu revisión</p>
          <p className="text-tiny opacity-80">Inicia la revisión para registrar el cambio de estado y comenzar a editar.</p>
        </div>
        <Button variant="ghost" size="sm" className="hover:bg-background/40" disabled={submitting}>
          Solo visualizar
        </Button>
        <Button size="sm" onClick={onStartReview} disabled={submitting}>
          Comenzar revisión
        </Button>
      </div>
    </div>
  );
}
