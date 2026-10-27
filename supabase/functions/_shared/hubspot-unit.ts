// Portal property verified against the live deal schema.
export const HUBSPOT_UNIT_PROPERTY = 'numero_de_departamento';
const HUBSPOT_VERSION = '2026-09';

export function unitNumber(data: Record<string, unknown>): string | undefined {
  for (const value of [data.unit_number, data.numero_depto, data.numero_de_departamento]) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

export async function enrichCaptacionUnit(
  data: Record<string, unknown>,
  externalId: unknown,
  token: string | undefined,
  fetcher: typeof fetch = fetch,
): Promise<Record<string, unknown>> {
  const existing = unitNumber(data);
  if (existing) return { ...data, unit_number: existing };
  // This recovery is scoped to Chile's deal intake; other markets keep their current behavior.
  if (data.inspection_type !== 'captacion' || !['cl', 'chile', 'cli'].includes(String(data.market).trim().toLowerCase())) return data;
  const id = String(externalId ?? '').replace(/^hs_deal_/, '');
  if (!/^\d+$/.test(id)) throw new Error('Missing valid HubSpot deal ID for apartment recovery');
  if (!token) throw new Error('HubSpot credentials unavailable for apartment recovery');
  const response = await fetcher(
    `https://api.hubapi.com/crm/objects/${HUBSPOT_VERSION}/deals/${encodeURIComponent(id)}?properties=${HUBSPOT_UNIT_PROPERTY}`,
    { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) },
  );
  if (!response.ok) throw new Error(`HubSpot apartment lookup [${response.status}]: ${await response.text()}`);
  const record = await response.json();
  const unit = unitNumber(record.properties ?? {});
  return unit ? { ...data, unit_number: unit } : data;
}