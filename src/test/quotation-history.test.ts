import { describe, expect, it } from 'vitest';
import { compareQuotations, snapshotTotals, type QuotationSnapshot } from '@/lib/quotation-history';

const original: QuotationSnapshot = { sections: [{ title: 'Cocina', repairs: [
  { id: 'oven', name: 'Horno', quantity: 2, unit_price: 120, subtotal: 240, payer_role: 'owner' },
] }] };
describe('quotation history', () => {
  it('keeps initial snapshot intact when a later price changes', () => {
    const modified = structuredClone(original);
    const repair = modified.sections?.[0].repairs?.[0];
    if (!repair) throw new Error('missing fixture');
    repair.unit_price = 150; repair.subtotal = 300;
    const diff = compareQuotations(original, modified);
    expect(diff.changes[0].fields).toContain('unit_price');
    expect(diff.totalBefore).toBe(240);
    expect(diff.totalAfter).toBe(300);
    expect(original.sections?.[0].repairs?.[0].unit_price).toBe(120);
  });
  it('detects removed and added items by ID, not by name', () => {
    const diff = compareQuotations(original, { sections: [{ repairs: [{ id: 'new', name: 'Horno' }] }] });
    expect(diff.changes.map(c => c.kind)).toEqual(['added', 'removed']);
  });
  it('records payer changes even if total stays the same', () => {
    const next = structuredClone(original);
    const repair = next.sections?.[0].repairs?.[0];
    if (!repair) throw new Error('missing fixture');
    repair.payer_role = 'tenant';
    expect(compareQuotations(original, next).changes[0].fields).toEqual(['payer_role']);
  });
  it('excludes pending items from historical totals', () => {
    expect(snapshotTotals({ sections: [{ repairs: [{ is_pending_quote: true, subtotal: 500 }] }] }).total).toBe(0);
  });
  it('uses frozen totals instead of current calculations', () => {
    expect(snapshotTotals({ ...original, quotation_totals: { subtotal: 240, owner: 240, tenant: 0, discount: 24, tax: 41, total: 257 } }).total).toBe(257);
  });
  it('uses saved tax and discount for legacy snapshots', () => {
    expect(snapshotTotals({ ...original, discount: { amount: 40 }, tax_config: { enabled: true, percentage: 16 } }).total).toBe(232);
  });
});