export type HubSpotAction = 'key_collection_date' | 'checkout_received' | 'checkin_completed';

const defaultProperties = {
  key_collection_date: 'fecha_de_recoleccion_de_llaves',
  checkout_received: 'fecha_de_recepcion_del_checkout',
  checkin_completed: 'checkin_hi_completo',
} as const;

/** Mexican check-outs live on deals (Renta Continua) instead of lease contracts. */
export function usesDealObject(inspectionType: string, market: string): boolean {
  return inspectionType === 'captacion' || (inspectionType === 'check_out' && market === 'MX');
}

/** Returns null when the market has no HubSpot field defined for the action yet. */
export function resolveHubSpotProperty(action: HubSpotAction, inspectionType: string, market: string): string | null {
  if (inspectionType === 'check_out' && market === 'MX') {
    if (action === 'key_collection_date') return 'fecha_de_devolucion_de_llaves';
    if (action === 'checkout_received') return 'fecha_de_recepcion_del_checkout_cl';
  }
  if (action === 'key_collection_date' && inspectionType === 'captacion') {
    if (market === 'CL') return 'fecha_recoleccion_llaves';
    if (market === 'MX') return 'fecha_de_visita_tecnica';
  }
  return defaultProperties[action];
}
/**
 * Owner properties sent alongside Chilean check-out updates so HubSpot shows who
 * received and who executes operations. Only resolved HubSpot owner IDs are sent.
 */
export function resolveAssigneeProperties(
  inspectionType: string,
  market: string,
  owners: { receptor?: string | null; executive?: string | null },
): Record<string, string> {
  if (inspectionType !== 'check_out' || market !== 'CL') return {};
  const out: Record<string, string> = {};
  if (owners.receptor) out.receptor = owners.receptor;
  if (owners.executive) out.ejecutivo_de_operaciones = owners.executive;
  return out;
}
