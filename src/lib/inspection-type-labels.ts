/**
 * Labels dinámicos según el tipo de inspección.
 *
 * Tipos soportados: `check_out`, `captacion`, `check_in`.
 * El campo en BD `fecha_de_termino_real_de_contrato` no cambia (deuda técnica);
 * aquí mapeamos solo lo visible al usuario y la semántica del contacto principal.
 */

export type InspectionType = 'check_out' | 'captacion' | 'check_in' | string | null | undefined;

/** Tipos canónicos con soporte de producto (UI, filtros, calendarios). */
export type CanonicalInspectionType = 'check_out' | 'captacion' | 'check_in';

export const CANONICAL_INSPECTION_TYPES: CanonicalInspectionType[] = [
  'check_out',
  'captacion',
  'check_in',
];

/** Normaliza cualquier valor de BD a un tipo canónico (fallback: check_out). */
export const normalizeInspectionType = (t: InspectionType): CanonicalInspectionType =>
  t === 'captacion' ? 'captacion' : t === 'check_in' ? 'check_in' : 'check_out';

export const isCaptacion = (t: InspectionType): boolean => t === 'captacion';

export const isCheckIn = (t: InspectionType): boolean => t === 'check_in';

/** El check-in no tiene etapa de cotización ni aprobación del propietario. */
export const requiresQuotation = (t: InspectionType): boolean => !isCheckIn(t);

const CONTRACT_DATE_LABELS: Record<CanonicalInspectionType, { long: string; short: string; micro: string }> = {
  check_out: {
    long: 'Fecha de término de contrato',
    short: 'Término de contrato',
    micro: 'Término',
  },
  captacion: {
    long: 'Fecha Tentativa de Recepción',
    short: 'Recepción tentativa',
    micro: 'Recepción',
  },
  check_in: {
    long: 'Fecha de inicio de contrato / entrega',
    short: 'Inicio de contrato',
    micro: 'Inicio',
  },
};

export const getContractDateLabel = (t: InspectionType): string =>
  CONTRACT_DATE_LABELS[normalizeInspectionType(t)].long;

export const getContractDateShortLabel = (t: InspectionType): string =>
  CONTRACT_DATE_LABELS[normalizeInspectionType(t)].short;

export const getContractDateMicroLabel = (t: InspectionType): string =>
  CONTRACT_DATE_LABELS[normalizeInspectionType(t)].micro;

export const getPrimaryContactLabel = (t: InspectionType): string =>
  isCaptacion(t) ? 'Propietario' : 'Inquilino';

const TYPE_LABELS: Record<CanonicalInspectionType, string> = {
  check_out: 'Check-out',
  captacion: 'Captación',
  check_in: 'Check-in',
};

export const getInspectionTypeLabel = (t: InspectionType): string =>
  TYPE_LABELS[normalizeInspectionType(t)];
