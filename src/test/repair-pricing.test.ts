import { describe, expect, it } from 'vitest';
import { quotedAmount, contractorAmount, canQuoteRepair, repairUpdate } from '@/lib/repair-pricing';

describe('pending quotation rules', () => {
  const pending = { quantity: 2, unit_price: 100, contractor_unit_price: 70, is_pending_quote: true };
  it('excludes pending client amounts from totals', () => expect(quotedAmount(pending)).toBe(0));
  it('excludes pending contractor costs from totals', () => expect(contractorAmount(pending)).toBe(0));
  it('does not allow pending items into decisions or work orders', () => expect(canQuoteRepair(pending)).toBe(false));
  it('does not confuse a free priced item with a pending quote', () => expect(canQuoteRepair({ is_pending_quote: false })).toBe(true));
  it('defining the price ends pending status without granting approval', () => {
    expect(repairUpdate('unit_price', 120)).toEqual({ unit_price: 120, is_pending_quote: false });
  });
  it('keeps pending status when editing quantity', () => expect(repairUpdate('quantity', 3)).toEqual({ quantity: 3 }));
  it('includes normally priced items in totals', () => expect(quotedAmount({ ...pending, is_pending_quote: false })).toBe(200));
});