import { supabase } from '@/integrations/supabase/client';

export interface MarketTaxSettings {
  market: string;
  vat_enabled: boolean;
  vat_percentage: number;
  vat_label: string;
  currency: string;
  updated_at?: string;
}

export interface VatBreakdown {
  subtotal: number;
  vatAmount: number;
  total: number;
  enabled: boolean;
  percentage: number;
  label: string;
}

const cache = new Map<string, MarketTaxSettings | null>();

export async function fetchTaxConfig(market: string | null | undefined): Promise<MarketTaxSettings | null> {
  if (!market) return null;
  if (cache.has(market)) return cache.get(market) ?? null;
  const { data, error } = await supabase
    .from('market_tax_settings' as any)
    .select('*')
    .eq('market', market)
    .maybeSingle();
  if (error) {
    console.error('fetchTaxConfig error', error);
    cache.set(market, null);
    return null;
  }
  const cfg = (data as unknown as MarketTaxSettings) ?? null;
  cache.set(market, cfg);
  return cfg;
}

export function invalidateTaxCache(market?: string) {
  if (market) cache.delete(market);
  else cache.clear();
}

export async function fetchAllTaxConfigs(): Promise<MarketTaxSettings[]> {
  const { data, error } = await supabase
    .from('market_tax_settings' as any)
    .select('*')
    .order('market');
  if (error) {
    console.error('fetchAllTaxConfigs error', error);
    return [];
  }
  return (data as unknown as MarketTaxSettings[]) ?? [];
}

export function applyVat(subtotal: number, config: MarketTaxSettings | null | undefined): VatBreakdown {
  const enabled = !!config?.vat_enabled && Number(config?.vat_percentage) > 0;
  const percentage = Number(config?.vat_percentage ?? 0);
  const label = config?.vat_label || 'IVA';
  const vatAmount = enabled ? Math.round((subtotal * percentage) / 100) : 0;
  return {
    subtotal,
    vatAmount,
    total: subtotal + vatAmount,
    enabled,
    percentage,
    label,
  };
}
