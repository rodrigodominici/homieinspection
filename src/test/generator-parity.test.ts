/**
 * Parity test: src/lib/inspection-generator.ts (client mirror) must produce
 * the same section structure as supabase/functions/_shared/inspection-generator.ts
 * (canonical for external ingestion). Drift here means HubSpot-created inspections
 * and manually-created ones diverge.
 */
import { describe, it, expect } from 'vitest';
import { generateSections as generateClient } from '@/lib/inspection-generator';
// @ts-expect-error — Deno-style relative import works under Vitest as a normal TS file
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
