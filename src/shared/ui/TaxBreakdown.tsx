import { useEffect, useState } from 'react';
import { fetchTaxConfig, applyVat, type MarketTaxSettings } from '@/lib/tax';
import { MoneyDisplay } from './MoneyDisplay';
import { cn } from '@/lib/utils';

export interface TaxBreakdownProps {
  net: number;
  market: string | null | undefined;
  /** Override fetched config (avoids extra round-trip when caller already loaded it). */
  config?: MarketTaxSettings | null;
  className?: string;
  /** Visual density. Compact = inline list. Default = stacked rows. */
  variant?: 'default' | 'compact';
  /** Labels (defaults in Spanish). */
  labels?: { net?: string; total?: string };
}

/**
 * Canonical VAT breakdown for customer-facing surfaces (quotations, owner report).
 * Operational surfaces (executive totals, repair editor) should keep using <MoneyDisplay /> directly.
 */
export function TaxBreakdown({ net, market, config, className, variant = 'default', labels }: TaxBreakdownProps) {
  const [resolved, setResolved] = useState<MarketTaxSettings | null>(config ?? null);

  useEffect(() => {
    if (config !== undefined) { setResolved(config); return; }
    let cancelled = false;
    void fetchTaxConfig(market ?? null).then((c) => { if (!cancelled) setResolved(c); });
    return () => { cancelled = true; };
  }, [market, config]);

  const v = applyVat(net, resolved);
  const netLabel = labels?.net ?? 'Subtotal';
  const totalLabel = labels?.total ?? 'Total';

  if (!v.enabled) {
    return (
      <div className={cn('flex items-center justify-between text-sm', className)}>
        <span className="text-muted-foreground">{totalLabel}</span>
        <MoneyDisplay value={v.total} market={market} className="font-semibold" />
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <div className={cn('flex items-center justify-end gap-3 text-xs', className)}>
        <span className="text-muted-foreground">{netLabel} <MoneyDisplay value={v.subtotal} market={market} /></span>
        <span className="text-muted-foreground">{v.label} {v.percentage}% <MoneyDisplay value={v.vatAmount} market={market} /></span>
        <span className="font-semibold">{totalLabel} <MoneyDisplay value={v.total} market={market} className="font-semibold" /></span>
      </div>
    );
  }

  return (
    <div className={cn('space-y-1 text-sm', className)}>
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">{netLabel}</span>
        <MoneyDisplay value={v.subtotal} market={market} />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">{v.label} {v.percentage}%</span>
        <MoneyDisplay value={v.vatAmount} market={market} />
      </div>
      <div className="flex items-center justify-between pt-1 border-t border-border/70">
        <span className="font-medium">{totalLabel}</span>
        <MoneyDisplay value={v.total} market={market} className="font-semibold" />
      </div>
    </div>
  );
}
