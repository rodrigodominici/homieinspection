import { cn } from '@/lib/utils';

const inspectionStatusConfig: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pendiente', className: 'bg-muted text-muted-foreground' },
  pending_assignment: { label: 'Sin Asignar', className: 'bg-status-bad-bg text-status-bad' },
  assigned: { label: 'Asignada', className: 'bg-status-regular-bg text-status-regular' },
  in_progress: { label: 'En Progreso', className: 'bg-status-regular-bg text-status-regular' },
  submitted: { label: 'Lista para revisión', className: 'bg-primary/10 text-primary' },
  in_review: { label: 'En revisión', className: 'bg-primary/10 text-primary' },
  needs_changes: { label: 'Requiere Cambios', className: 'bg-status-bad-bg text-status-bad' },
  approved: { label: 'Aprobada', className: 'bg-status-good-bg text-status-good' },
  published: { label: 'Publicada', className: 'bg-status-good-bg text-status-good' },
  sent: { label: 'Entregada', className: 'bg-status-good-bg text-status-good' },
};


export function InspectionStatusBadge({ status }: { status: string }) {
  const config = inspectionStatusConfig[status] ?? { label: status, className: 'bg-muted text-muted-foreground' };
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', config.className)}>
      {config.label}
    </span>
  );
}

const sectionStatusConfig: Record<string, { label: string; className: string }> = {
  not_started: { label: 'Pendiente', className: 'bg-muted text-muted-foreground' },
  in_progress: { label: 'En Progreso', className: 'bg-status-regular-bg text-status-regular' },
  completed: { label: 'Completada', className: 'bg-status-good-bg text-status-good' },
  needs_changes: { label: 'Cambios', className: 'bg-status-bad-bg text-status-bad' },
  reviewed: { label: 'Revisada', className: 'bg-primary/10 text-primary' },
};

export function SectionStatusBadge({ status }: { status: string }) {
  const config = sectionStatusConfig[status] ?? { label: status, className: 'bg-muted text-muted-foreground' };
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium', config.className)}>
      {config.label}
    </span>
  );
}
