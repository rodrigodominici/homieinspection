/**
 * Detección de inspecciones "incompletas / estancadas".
 *
 * Eje transversal (no reemplaza los stages de `inspection-buckets`):
 * una inspección está abierta (no publicada ni finalizada) y no registra
 * actividad por más de N días según su etapa.
 */
import type { Inspection } from './types';

export type StalledReason = 'not_started' | 'in_progress' | 'review';

/** Umbrales en días sin actividad (`updated_at`). Ajustables en un solo lugar. */
export const STALL_THRESHOLD_DAYS: Record<StalledReason, number> = {
  not_started: 3,
  in_progress: 2,
  review: 5,
};

export const STALL_REASON_LABEL: Record<StalledReason, string> = {
  not_started: 'Sin iniciar',
  in_progress: 'Iniciada y detenida',
  review: 'Detenida en cotización',
};

type MinimalInspection = Pick<Inspection, 'status' | 'updated_at'>;

/** Etapa abierta a la que pertenece la inspección, o null si ya está cerrada. */
export function openReasonOf(insp: MinimalInspection): StalledReason | null {
  switch (insp.status) {
    case 'pending':
    case 'pending_assignment':
    case 'assigned':
      return 'not_started';
    case 'in_progress':
      return 'in_progress';
    case 'submitted':
    case 'in_review':
      return 'review';
    default:
      return null;
  }
}

export function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

export interface StalledInfo {
  reason: StalledReason;
  /** Días sin actividad. */
  idleDays: number;
  threshold: number;
  stalled: boolean;
}

/** Evalúa una inspección; devuelve null si ya no está abierta. */
export function evaluateStall(insp: MinimalInspection): StalledInfo | null {
  const reason = openReasonOf(insp);
  if (!reason) return null;
  const idleDays = daysSince(insp.updated_at) ?? 0;
  const threshold = STALL_THRESHOLD_DAYS[reason];
  return { reason, idleDays, threshold, stalled: idleDays >= threshold };
}

/** Atajo booleano usado por KPIs y filtros. */
export function isStalled(insp: MinimalInspection): boolean {
  return evaluateStall(insp)?.stalled ?? false;
}

/** Tono de color según cuánto excede el umbral. */
export function stallTone(info: StalledInfo): string {
  if (!info.stalled) return 'text-muted-foreground';
  if (info.idleDays >= info.threshold * 3) return 'text-status-bad';
  return 'text-status-regular';
}
