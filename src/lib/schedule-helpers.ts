/**
 * Helpers compartidos por AdminSchedule y ExecutiveSchedule:
 * - Filtros por estado terminal (no deben aparecer en agenda operativa).
 * - Estilos visuales diferenciados por tipo de inspección.
 * - Bucketing de "Por coordinar" por proximidad temporal.
 */

import type { InspectionType } from './inspection-type-labels';

// Estados en los que la inspección ya terminó su flujo operativo y NO debe
// aparecer en el calendario de coordinación.
export const TERMINAL_SCHEDULE_STATUSES = new Set<string>([
  'published',
  'sent',
  'approved',
  'archived',
]);

export const isTerminalScheduleStatus = (status: string | null | undefined): boolean =>
  !!status && TERMINAL_SCHEDULE_STATUSES.has(status);

export type ScheduleTypeFilter = 'all' | 'check_out' | 'captacion';

/**
 * Clases tailwind por tipo de inspección para diferenciación visual en banner
 * y tarjetas "Por coordinar".
 */
export interface TypeVisualTokens {
  bannerItemClass: string;      // <a> dentro del banner semanal
  bannerSubtextClass: string;   // línea secundaria (fecha/inspector)
  bannerInspectorClass: string;
  cardRingClass: string;        // ring del Card en sección bottom
  chipClass: string;            // chip "Check-out" / "Captación"
  bottomBgClass: string;        // wrapper de la sección bottom
  dateLineClass: string;        // línea de fecha en el card
}

const CHECK_OUT_TOKENS: TypeVisualTokens = {
  bannerItemClass:
    'block rounded-md border border-dashed border-amber-300 bg-amber-50 text-amber-800 px-1.5 py-1 text-[10px] leading-tight hover:bg-amber-100 transition-colors mb-0.5',
  bannerSubtextClass: 'block truncate text-amber-600',
  bannerInspectorClass: 'block text-amber-500 truncate',
  cardRingClass: 'border-0 ring-1 ring-amber-200 shadow-sm hover:shadow-md transition-shadow border-dashed',
  chipClass: 'inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 rounded-full px-2 py-0.5',
  bottomBgClass: 'bg-amber-50/30',
  dateLineClass: 'flex items-center gap-1 text-tiny text-amber-700 mt-1',
};

const CAPTACION_TOKENS: TypeVisualTokens = {
  bannerItemClass:
    'block rounded-md border-2 border-dashed border-indigo-300 bg-indigo-50 text-indigo-800 px-1.5 py-1 text-[10px] leading-tight hover:bg-indigo-100 transition-colors mb-0.5',
  bannerSubtextClass: 'block truncate text-indigo-600',
  bannerInspectorClass: 'block text-indigo-500 truncate',
  cardRingClass: 'border-0 ring-1 ring-indigo-200 shadow-sm hover:shadow-md transition-shadow border-dashed',
  chipClass: 'inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-700 bg-indigo-50 rounded-full px-2 py-0.5',
  bottomBgClass: 'bg-indigo-50/30',
  dateLineClass: 'flex items-center gap-1 text-tiny text-indigo-700 mt-1',
};

export const getTypeVisualTokens = (t: InspectionType): TypeVisualTokens =>
  t === 'captacion' ? CAPTACION_TOKENS : CHECK_OUT_TOKENS;

/** Devuelve la fecha formateada, con prefijo "Estimada · " para captación. */
export const formatScheduleDate = (date: Date, t: InspectionType, opts?: Intl.DateTimeFormatOptions): string => {
  const formatted = date.toLocaleDateString('es-CL', opts ?? { day: 'numeric', month: 'short', year: 'numeric' });
  return t === 'captacion' ? `Estimada · ${formatted}` : formatted;
};

// Bucketing por proximidad para sección "Por coordinar" bottom.
export type ProximityBucket = 'overdue' | 'this_week' | 'upcoming';

export const PROXIMITY_LABELS: Record<ProximityBucket, string> = {
  overdue: 'Vencidas',
  this_week: 'Esta semana',
  upcoming: 'Próximas',
};

export function getProximityBucket(date: Date, weekStart: Date): ProximityBucket {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  if (target.getTime() < today.getTime()) return 'overdue';
  if (target.getTime() <= weekEnd.getTime()) return 'this_week';
  return 'upcoming';
}
