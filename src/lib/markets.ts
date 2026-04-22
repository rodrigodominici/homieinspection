// Shared market & phone constants/helpers used by user management.

export const MARKET_OPTIONS = [
  { value: 'CL', label: 'Chile' },
  { value: 'MX', label: 'México' },
] as const;

export const COUNTRY_CODE_OPTIONS = [
  { value: '+56', label: '+56 Chile' },
  { value: '+52', label: '+52 México' },
] as const;

/** Default country code matching a market code (CL → +56, MX → +52). */
export function defaultCountryCodeForMarket(market: string | null | undefined): string {
  if (market === 'MX') return '+52';
  return '+56';
}

/** Display-friendly market label. Falls back to the raw code. */
export function marketLabel(code: string | null | undefined): string {
  if (!code) return '—';
  const found = MARKET_OPTIONS.find((m) => m.value === code);
  return found?.label ?? code;
}

/** Strip everything that isn't a digit. */
export function normalizePhone(raw: string): string {
  return (raw ?? '').replace(/\D+/g, '');
}

/** Ensure leading '+' and only digits after it. */
export function normalizeCountryCode(raw: string): string {
  const digits = (raw ?? '').replace(/\D+/g, '');
  if (!digits) return '';
  return `+${digits}`;
}

/** Compose a display string for a phone (e.g. "+56 912345678"). */
export function formatPhoneDisplay(
  countryCode: string | null | undefined,
  phone: string | null | undefined,
): string {
  const c = (countryCode ?? '').trim();
  const p = (phone ?? '').trim();
  if (!c && !p) return '—';
  if (!p) return c;
  return `${c} ${p}`.trim();
}
