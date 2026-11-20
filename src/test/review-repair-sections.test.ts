import { describe, expect, it } from 'vitest';
import { isRepairableSection, isReviewVisibleSection } from '@/lib/inspection-utils';

describe('review repair sections', () => {
  it('allows repair items in Otros Generales', () => {
    expect(isRepairableSection({ section_type: 'closing_operational' })).toBe(true);
  });

  it('keeps Otros Generales in review navigation', () => {
    expect(isReviewVisibleSection({ section_type: 'closing_operational' })).toBe(true);
  });

  it.each(['handover_meta', 'reception_meta', 'marketing_photos'])('does not budget %s metadata', (section_type) => {
    expect(isRepairableSection({ section_type })).toBe(false);
  });
});