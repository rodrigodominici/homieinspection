import type { Inspection } from '@/lib/types';
import { getEffectiveSnapshot } from '@/lib/inspection-utils';

type InspectorDisplayTone = 'neutral' | 'primary' | 'warning' | 'good';

export interface InspectorDisplayState {
  key:
    | 'assigned'
    | 'in_progress'
    | 'ready_to_submit'
    | 'needs_changes'
    | 'submitted'
    | 'in_review'
    | 'approved'
    | 'published'
    | 'sent'
    | 'unknown';
  label: string;
  tone: InspectorDisplayTone;
}

const COMPLETED_SIGNAL_STATUSES = new Set(['submitted', 'in_review', 'approved', 'published', 'sent']);

export function getScheduleDatetime(inspection: Inspection): Date | null {
  const snapshot = getEffectiveSnapshot(inspection);
  const fecha = snapshot?.fecha_recoleccion_llaves as string | undefined;
  const hora = snapshot?.hora_recoleccion_llaves as string | undefined;

  if (fecha) {
    const dt = new Date(`${fecha}T${hora || '00:00'}`);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  if (inspection.scheduled_at) {
    const dt = new Date(inspection.scheduled_at);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  return null;
}

export function getInspectorDisplayState(
  inspection: Pick<Inspection, 'status' | 'started_at'>,
  completedSections: number,
  totalSections: number
): InspectorDisplayState {
  const progressPercent = totalSections > 0 ? Math.round((completedSections / totalSections) * 100) : 0;

  if (inspection.status === 'needs_changes') {
    return { key: 'needs_changes', label: 'Requiere cambios', tone: 'warning' };
  }

  if (inspection.status === 'submitted') return { key: 'submitted', label: 'Enviada', tone: 'good' };
  if (inspection.status === 'in_review') return { key: 'in_review', label: 'En revisión', tone: 'primary' };
  if (inspection.status === 'approved') return { key: 'approved', label: 'Aprobada', tone: 'good' };
  if (inspection.status === 'published') return { key: 'published', label: 'Publicada', tone: 'good' };
  if (inspection.status === 'sent') return { key: 'sent', label: 'Enviada', tone: 'good' };

  if (progressPercent === 100 && totalSections > 0) {
    return { key: 'ready_to_submit', label: 'Lista para enviar', tone: 'good' };
  }

  if (progressPercent > 0 || inspection.started_at) {
    return { key: 'in_progress', label: 'En progreso', tone: 'primary' };
  }

  if (['assigned', 'pending_assignment', 'pending'].includes(inspection.status)) {
    return { key: 'assigned', label: 'Asignada', tone: 'neutral' };
  }

  return { key: 'unknown', label: inspection.status, tone: 'neutral' };
}

export function matchesInspectorStateFilter(
  stateFilter: string | null,
  inspection: Pick<Inspection, 'status' | 'started_at'>,
  completedSections: number,
  totalSections: number
): boolean {
  if (!stateFilter) return true;

  const display = getInspectorDisplayState(inspection, completedSections, totalSections);

  if (stateFilter === 'in_progress') return display.key === 'in_progress';
  if (stateFilter === 'assigned_or_needs_changes') {
    return display.key === 'assigned' || display.key === 'needs_changes';
  }

  return true;
}

function toChileDateKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function isCompletedToday(inspection: Inspection, now = new Date()): boolean {
  if (!COMPLETED_SIGNAL_STATUSES.has(inspection.status)) return false;
  const completionSignal = inspection.inspection_completed_at ?? inspection.completed_at;
  if (!completionSignal) return false;
  const date = new Date(completionSignal);
  if (Number.isNaN(date.getTime())) return false;
  return toChileDateKey(date) === toChileDateKey(now);
}