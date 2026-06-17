/**
 * Labels dinámicos según el tipo de inspección.
 *
 * El campo en BD `fecha_de_termino_real_de_contrato` no cambia (deuda técnica
 * registrada en .lovable/plan.md); aquí mapeamos solo lo visible al usuario y
 * la semántica del contacto principal.
 */

export type InspectionType = 'check_out' | 'captacion' | string | null | undefined;

export const isCaptacion = (t: InspectionType): boolean => t === 'captacion';

export const getContractDateLabel = (t: InspectionType): string =>
  isCaptacion(t) ? 'Fecha Tentativa de Recepción' : 'Fecha de término de contrato';

export const getContractDateShortLabel = (t: InspectionType): string =>
  isCaptacion(t) ? 'Recepción tentativa' : 'Término de contrato';

export const getContractDateMicroLabel = (t: InspectionType): string =>
  isCaptacion(t) ? 'Recepción' : 'Término';

export const getPrimaryContactLabel = (t: InspectionType): string =>
  isCaptacion(t) ? 'Propietario' : 'Inquilino';

export const getInspectionTypeLabel = (t: InspectionType): string =>
  isCaptacion(t) ? 'Captación' : 'Check-out';
