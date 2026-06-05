/**
 * Quotation-level discount math.
 *
 * Pure functions — no React, no Supabase. Discount is applied BEFORE VAT
 * (over the subtotal), and prorated proportionally between owner and tenant
 * payer buckets. Repair item prices are never mutated.
 */
import { applyVat, type MarketTaxSettings } from './tax';

export type DiscountType = 'percentage' | 'fixed';

export interface QuotationDiscountInput {
  type: DiscountType;
  /** percentage 0-100, or fixed amount in currency units */
  value: number;
  reason?: string | null;
}

export interface QuotationDiscountBreakdown {
  subtotalOwner: number;
  subtotalTenant: number;
  subtotalTotal: number;

  /** Active discount metadata, or null when no discount is applied. */
  discount: QuotationDiscountInput | null;
  discountOwner: number;
  discountTenant: number;
  discountAmount: number;

  /** Subtotal − discount, i.e. the VAT base for each payer. Never negative. */
  baseOwner: number;
  baseTenant: number;
  baseTotal: number;

  vatOwner: number;
  vatTenant: number;
  vatTotal: number;
  vatLabel: string;
  vatPercentage: number;
  vatEnabled: boolean;

  totalOwner: number;
  totalTenant: number;
  grandTotal: number;
}

/**
 * Compute the discount amount for the combined subtotal, clamped so the
 * total never goes negative.
 */
export function computeDiscountAmount(
  subtotalTotal: number,
  discount: QuotationDiscountInput | null | undefined,
): number {
  if (!discount || subtotalTotal <= 0) return 0;
  if (discount.type === 'percentage') {
    const pct = Math.min(Math.max(Number(discount.value) || 0, 0), 100);
    return Math.round((subtotalTotal * pct) / 100);
  }
  const fixed = Math.max(Number(discount.value) || 0, 0);
  return Math.min(Math.round(fixed), subtotalTotal);
}

/**
 * Apply a quotation discount + VAT on top of per-payer subtotals.
 *
 * Discount is prorated proportionally to the owner/tenant subtotal share.
 * Residue (from rounding) is assigned to the owner so the parts always
 * sum to the combined amount exactly.
 */
export function applyQuotationDiscount(opts: {
  subtotalOwner: number;
  subtotalTenant: number;
  discount: QuotationDiscountInput | null | undefined;
  taxConfig: MarketTaxSettings | null | undefined;
}): QuotationDiscountBreakdown {
  const subtotalOwner = Math.max(0, Math.round(opts.subtotalOwner || 0));
  const subtotalTenant = Math.max(0, Math.round(opts.subtotalTenant || 0));
  const subtotalTotal = subtotalOwner + subtotalTenant;

  const discount = opts.discount ?? null;
  const discountAmount = computeDiscountAmount(subtotalTotal, discount);

  let discountOwner = 0;
  let discountTenant = 0;
  if (discountAmount > 0 && subtotalTotal > 0) {
    discountTenant = Math.round((discountAmount * subtotalTenant) / subtotalTotal);
    discountOwner = discountAmount - discountTenant;
    // Safety: never exceed the bucket subtotal.
    if (discountOwner > subtotalOwner) {
      const overflow = discountOwner - subtotalOwner;
      discountOwner = subtotalOwner;
      discountTenant = Math.min(subtotalTenant, discountTenant + overflow);
    }
    if (discountTenant > subtotalTenant) {
      const overflow = discountTenant - subtotalTenant;
      discountTenant = subtotalTenant;
      discountOwner = Math.min(subtotalOwner, discountOwner + overflow);
    }
  }

  const baseOwner = Math.max(0, subtotalOwner - discountOwner);
  const baseTenant = Math.max(0, subtotalTenant - discountTenant);
  const baseTotal = baseOwner + baseTenant;

  const vatOwnerBreak = applyVat(baseOwner, opts.taxConfig);
  const vatTenantBreak = applyVat(baseTenant, opts.taxConfig);

  return {
    subtotalOwner,
    subtotalTenant,
    subtotalTotal,
    discount: discount && discountAmount > 0 ? discount : null,
    discountOwner,
    discountTenant,
    discountAmount,
    baseOwner,
    baseTenant,
    baseTotal,
    vatOwner: vatOwnerBreak.vatAmount,
    vatTenant: vatTenantBreak.vatAmount,
    vatTotal: vatOwnerBreak.vatAmount + vatTenantBreak.vatAmount,
    vatLabel: vatOwnerBreak.label,
    vatPercentage: vatOwnerBreak.percentage,
    vatEnabled: vatOwnerBreak.enabled,
    totalOwner: vatOwnerBreak.total,
    totalTenant: vatTenantBreak.total,
    grandTotal: vatOwnerBreak.total + vatTenantBreak.total,
  };
}

/** Validate a discount input prior to persisting. Returns an error string or null. */
export function validateDiscount(input: QuotationDiscountInput, subtotalTotal: number): string | null {
  if (!Number.isFinite(input.value) || input.value < 0) return 'El valor debe ser positivo';
  if (input.type === 'percentage') {
    if (input.value > 100) return 'El porcentaje no puede exceder 100%';
    if (input.value === 0) return 'Ingresa un porcentaje mayor a 0';
  } else {
    if (input.value === 0) return 'Ingresa un monto mayor a 0';
    if (input.value > subtotalTotal) return 'El descuento no puede superar el subtotal';
  }
  return null;
}
