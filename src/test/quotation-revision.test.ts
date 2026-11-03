import { describe, expect, it } from 'vitest';
import { canReviseWork, revisionDifference, revisionResult, type RevisionChange } from '@/lib/quotation-revision';
const values = { title_snapshot: 'Horno', quantity: 2, unit: 'serv', unit_price: 100, payer_role: 'owner' as const };
const change: RevisionChange = { id: 'change', repair_item_id: 'repair', kind: 'modify', before_json: values, after_json: { ...values, unit_price: 150 }, decision: null, comment: null, applied_at: null };
describe('quotation changes with an existing work order', () => {
  it('keeps the previous values until the investor approves', () => expect(revisionResult(change)?.unit_price).toBe(100));
  it('applies the changed price only after approval', () => expect(revisionResult({ ...change, decision: 'accepted' })?.unit_price).toBe(150));
  it('keeps the old price when the investor rejects', () => expect(revisionResult({ ...change, decision: 'rejected' })?.unit_price).toBe(100));
  it('does not allow quotation edits to completed work', () => expect(canReviseWork('done')).toBe(false));
  it('allows quotation revisions of pending work', () => expect(canReviseWork('pending')).toBe(true));
  it('preserves archived work without allowing modifications', () => expect(canReviseWork('pending', true)).toBe(false));
  it('records the concrete amount difference', () => expect(revisionDifference(change)).toBe(100));
  it('keeps a removal pending until approval', () => expect(revisionResult({ ...change, kind: 'remove', after_json: null })).toEqual(values));
  it('represents an approved removal without deleting its original evidence', () => expect(revisionResult({ ...change, kind: 'remove', after_json: null, decision: 'accepted' })).toBeNull());
});