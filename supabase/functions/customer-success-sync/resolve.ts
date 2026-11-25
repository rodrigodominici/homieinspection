// Pure rules: which HubSpot source holds the Customer Success agent per market.
export type CsSource =
  | { kind: 'contract_property'; label: string }
  | { kind: 'ticket_owner'; pipelineLabel: string };

export function resolveCustomerSuccessSource(market: string | null | undefined): CsSource | null {
  const m = (market ?? '').toUpperCase();
  if (m === 'CL') return { kind: 'contract_property', label: 'Ejecutiva(o) Customer Success' };
  if (m === 'MX') return { kind: 'ticket_owner', pipelineLabel: 'Finalizaciones' };
  return null;
}

export function normalizeLabel(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
