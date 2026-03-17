import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { InspectionStatus, SectionStatus } from '@/lib/types';

const inspectionStatusConfig: Record<InspectionStatus, { label: string; className: string }> = {
  pending: { label: 'Pendiente', className: 'bg-muted text-muted-foreground' },
  assigned: { label: 'Asignada', className: 'bg-primary/10 text-primary' },
  in_progress: { label: 'En Progreso', className: 'bg-status-regular-bg text-status-regular' },
  submitted: { label: 'Enviada', className: 'bg-primary/10 text-primary' },
  in_review: { label: 'En Revisión', className: 'bg-status-regular-bg text-status-regular' },
  needs_changes: { label: 'Requiere Cambios', className: 'bg-status-bad-bg text-status-bad' },
  approved: { label: 'Aprobada', className: 'bg-status-good-bg text-status-good' },
  published: { label: 'Publicada', className: 'bg-status-good-bg text-status-good' },
  sent: { label: 'Enviada', className: 'bg-status-good-bg text-status-good' },
};

const sectionStatusConfig: Record<SectionStatus, { label: string; className: string }> = {
  not_started: { label: 'Sin Iniciar', className: 'bg-muted text-muted-foreground' },
  in_progress: { label: 'En Progreso', className: 'bg-status-regular-bg text-status-regular' },
  completed: { label: 'Completada', className: 'bg-status-good-bg text-status-good' },
  needs_changes: { label: 'Requiere Cambios', className: 'bg-status-bad-bg text-status-bad' },
  reviewed: { label: 'Revisada', className: 'bg-primary/10 text-primary' },
};

export function InspectionStatusBadge({ status }: { status: InspectionStatus }) {
  const config = inspectionStatusConfig[status] ?? { label: status, className: '' };
  return <Badge variant="secondary" className={cn('font-medium', config.className)}>{config.label}</Badge>;
}

export function SectionStatusBadge({ status }: { status: SectionStatus }) {
  const config = sectionStatusConfig[status] ?? { label: status, className: '' };
  return <Badge variant="secondary" className={cn('font-medium text-xs', config.className)}>{config.label}</Badge>;
}
