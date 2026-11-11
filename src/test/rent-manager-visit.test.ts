import { describe, expect, it } from 'vitest';
import { chileVisitDate, visitAvailableFrom } from '../lib/rent-manager-visit';
describe('Rent Manager visit dates', () => {
  it('uses the visit day for immediate availability', () => expect(visitAvailableFrom('2026-11-06', 'inmediata')).toBe('2026-11-06'));
  it('adds five calendar days including a weekend', () => expect(visitAvailableFrom('2026-11-06', 'en_5_dias')).toBe('2026-11-11'));
  it('uses Chile day rather than UTC at midnight', () => expect(chileVisitDate(new Date('2026-11-07T01:00:00Z'))).toBe('2026-11-06'));
});