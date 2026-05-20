import { cn } from '@/lib/utils';

const LOCALE_BY_MARKET: Record<string, string> = {
  CL: 'es-CL',
  MX: 'es-MX',
};

const CURRENCY_BY_MARKET: Record<string, string> = {
  CL: 'CLP',
  MX: 'MXN',
};

export interface MoneyDisplayProps {
  value: number | null | undefined;
  market?: string | null;
  currency?: string;
  className?: string;
  /** Render as `–` when value is nullish. Default true. */
  showDash?: boolean;
}

/**
 * Canonical money formatter for all operational + customer-facing surfaces.
 * Defaults to CLP / es-CL when market is missing (historical baseline).
 */
export function MoneyDisplay({ value, market, currency, className, showDash = true }: MoneyDisplayProps) {
  if (value == null || Number.isNaN(value)) {
    return <span className={cn('font-mono tabular-nums', className)}>{showDash ? '–' : ''}</span>;
  }
  const locale = LOCALE_BY_MARKET[market ?? ''] ?? 'es-CL';
  const ccy = currency ?? CURRENCY_BY_MARKET[market ?? ''] ?? 'CLP';
  const text = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: ccy,
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(value);
  return <span className={cn('font-mono tabular-nums', className)}>{text}</span>;
}
