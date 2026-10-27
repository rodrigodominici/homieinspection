/**
 * Parity test: src/lib/inspection-generator.ts (client mirror) must produce
 * the same section structure as supabase/functions/_shared/inspection-generator.ts
 * (canonical for external ingestion). Drift here means HubSpot-created inspections
 * and manually-created ones diverge.
 */
import { describe, it, expect } from 'vitest';
import { generateSections as generateClient } from '@/lib/inspection-generator';
// @ts-ignore — relative .ts import resolved by Vitest
import { generateSections as generateShared } from '../../supabase/functions/_shared/inspection-generator.ts';

const departamento2D1B = {
  property_id: 'RE0001604',
  market: 'CL',
  property_name: 'Test',
  property_type: 'departamento',
  inspection_type: 'check_out',
  bedrooms_count: 2,
  bathrooms_count: 1,
  has_storage: false,
  has_parking: false,
};

describe('inspection-generator parity', () => {
  it('client and shared generators produce identical section keys+order for departamento 2D/1B', () => {
    const a = generateClient(departamento2D1B as any).map((s) => ({ key: s.section_key, order: s.sort_order, fields: s.fields.length }));
    const b = generateShared(departamento2D1B as any).map((s: any) => ({ key: s.section_key, order: s.sort_order, fields: s.fields.length }));
    expect(b).toEqual(a);
  });
});

import { canCompleteSection, canFinalizeInspection } from '@/lib/section-completion';

describe('marketing photos (captación)', () => {
  const base = { ...departamento2D1B };
  it('captación gets marketing_photos right before the signature; check-in/out do not', () => {
    for (const gen of [generateClient, generateShared]) {
      const keys = gen({ ...base, inspection_type: 'captacion' } as any).map((s: any) => s.section_key);
      expect(keys.slice(-2)).toEqual(['marketing_photos', 'tenant_signature']);
      expect(gen({ ...base, inspection_type: 'check_out' } as any).some((s: any) => s.section_key === 'marketing_photos')).toBe(false);
      expect(gen({ ...base, inspection_type: 'check_in' } as any).some((s: any) => s.section_key === 'marketing_photos')).toBe(false);
    }
  });
  it('section needs at least 10 photos to complete', () => {
    expect(canCompleteSection('marketing_photos', [], 'marketing_photos', 9).valid).toBe(false);
    expect(canCompleteSection('marketing_photos', [], 'marketing_photos', 10).valid).toBe(true);
  });
  it('inspection cannot be submitted with 9 marketing photos', () => {
    const sections = [{ id: 'm', section_key: 'marketing_photos', is_visible: true }];
    expect(canFinalizeInspection(sections, { m: 9 }).valid).toBe(false);
    expect(canFinalizeInspection(sections, { m: 10 }).valid).toBe(true);
  });
});
