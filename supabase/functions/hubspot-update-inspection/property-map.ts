export type HubSpotAction = 'key_collection_date' | 'checkout_received' | 'checkin_completed';

const defaultProperties = {
  key_collection_date: 'fecha_de_recoleccion_de_llaves',
  checkout_received: 'fecha_de_recepcion_del_checkout',
  checkin_completed: 'checkin_hi_completo',
} as const;

export function resolveHubSpotProperty(action: HubSpotAction, inspectionType: string, market: string): string {
  if (action === 'key_collection_date' && inspectionType === 'captacion') {
    if (market === 'CL') return 'fecha_recoleccion_llaves';
    if (market === 'MX') return 'fecha_de_visita_tecnica';
  }
  return defaultProperties[action];
}