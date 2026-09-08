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

/**
 * Normaliza cualquier valor de mercado histórico ("chile", "CL", "mexico", "MX")
 * al código canónico de dos letras.
 */
export function normalizeMarket(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim().toLowerCase();
  if (!v) return null;
  if (v === 'cl' || v === 'chile' || v === 'cli') return 'CL';
  if (v === 'mx' || v === 'mexico' || v === 'méxico') return 'MX';
  return raw!.trim().toUpperCase();
}

/** Display-friendly market label. Falls back to the normalized code. */
export function marketLabel(code: string | null | undefined): string {
  const norm = normalizeMarket(code);
  if (!norm) return '—';
  const found = MARKET_OPTIONS.find((m) => m.value === norm);
  return found?.label ?? norm;
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
