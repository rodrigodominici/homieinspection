/**
 * Etapa de obra — se ubica entre "Aprobado" y "Finalizado" y solo aplica a
 * inspecciones de captación / check-out donde `quien_repara = 'homie'`.
 */
export type WorkStatus = 'not_applicable' | 'in_progress' | 'in_review' | 'done';
export type WorkOrderStatus = 'open' | 'in_progress' | 'in_review' | 'approved' | 'rejected' | 'contractor_rejected';
export type KeysStatus =
  | 'homie'
  | 'administracion'
  | 'responsable_autorizado'
  | 'propietario'
  | 'proveedor'
  | 'candado';
export type WorkOrderItemStatus = 'pending' | 'in_progress' | 'done' | 'not_done';

export const WORK_STATUS_LABELS: Record<WorkStatus, string> = {
  not_applicable: 'Sin obra',
  in_progress: 'Reparación en curso',
  in_review: 'Reparación en revisión',
  done: 'Reparación aprobada',
};

export const WORK_ORDER_STATUS_LABELS: Record<WorkOrderStatus, string> = {
  open: 'Asignada · por aceptar',
  in_progress: 'En curso',
  in_review: 'En revisión',
  approved: 'Aprobada',
  rejected: 'Devuelta con observaciones',
  contractor_rejected: 'Rechazada por el contratista',
};

export const KEYS_STATUS_LABELS: Record<KeysStatus, string> = {
  homie: 'Homie',
  administracion: 'Administración del edificio',
  responsable_autorizado: 'Responsable autorizado',
  propietario: 'Propietario',
  proveedor: 'Proveedor',
  candado: 'Candado en la puerta',
};

export const KEYS_STATUS_OPTIONS: { value: KeysStatus; label: string }[] = (
  Object.keys(KEYS_STATUS_LABELS) as KeysStatus[]
).map((value) => ({ value, label: KEYS_STATUS_LABELS[value] }));

export function keysStatusLabel(v: string | null | undefined): string {
  if (!v) return 'Sin registrar';
  return KEYS_STATUS_LABELS[v as KeysStatus] ?? v;
}

export const WORK_ORDER_ITEM_STATUS_LABELS: Record<WorkOrderItemStatus, string> = {
  pending: 'Pendiente',
  in_progress: 'En curso',
  done: 'Terminada',
  not_done: 'No realizada',
};

export function workStatusLabel(v: string | null | undefined): string {
  if (!v) return WORK_STATUS_LABELS.not_applicable;
  return WORK_STATUS_LABELS[v as WorkStatus] ?? v;
}

export function workOrderStatusLabel(v: string | null | undefined): string {
  if (!v) return '—';
  return WORK_ORDER_STATUS_LABELS[v as WorkOrderStatus] ?? v;
}

export function workOrderItemStatusLabel(v: string | null | undefined): string {
  if (!v) return '—';
  return WORK_ORDER_ITEM_STATUS_LABELS[v as WorkOrderItemStatus] ?? v;
}

/** Clases de token para el chip de estado (evita colores hardcodeados). */
export function workOrderStatusToneClass(v: string | null | undefined): string {
  switch (v) {
    case 'approved':
      return 'bg-[hsl(var(--status-approved-bg))] text-[hsl(var(--status-approved-fg))]';
    case 'in_review':
      return 'bg-[hsl(var(--status-published-bg))] text-[hsl(var(--status-published-fg))]';
    case 'in_progress':
      return 'bg-[hsl(var(--status-in-progress-bg))] text-[hsl(var(--status-in-progress-fg))]';
    case 'rejected':
    case 'contractor_rejected':
      return 'bg-[hsl(var(--status-needs-changes-bg))] text-[hsl(var(--status-needs-changes-fg))]';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

export function workOrderItemToneClass(v: string | null | undefined): string {
  switch (v) {
    case 'done':
      return 'bg-[hsl(var(--status-approved-bg))] text-[hsl(var(--status-approved-fg))]';
    case 'not_done':
      return 'bg-[hsl(var(--status-needs-changes-bg))] text-[hsl(var(--status-needs-changes-fg))]';
    case 'in_progress':
      return 'bg-[hsl(var(--status-in-progress-bg))] text-[hsl(var(--status-in-progress-fg))]';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

/** ¿La orden admite edición por parte del contratista? Solo si ya la aceptó. */
export function isWorkOrderEditable(status: string | null | undefined): boolean {
  return status === 'in_progress' || status === 'rejected';
}

/** La orden fue asignada pero el contratista todavía no la aceptó. */
export function isWorkOrderPendingAcceptance(status: string | null | undefined): boolean {
  return status === 'open';
}
