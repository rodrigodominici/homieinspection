import { describe, expect, it } from 'vitest';
import { rentManagerUnit } from '../../supabase/functions/_shared/rent-manager-unit';

describe('Rent Manager apartment mapping', () => {
  it('reads San Martín 974 apartment 707 from location.unit', () => {
    expect(rentManagerUnit({ address: 'San Martín 974, Santiago, Santiago', unit: '707' })).toBe('707');
  });
  it('reads Comandante Malbec apartment 217 from location.unit', () => {
    expect(rentManagerUnit({ unit: '217' })).toBe('217');
  });
  it('preserves apartment letters and leading zeroes', () => {
    expect(rentManagerUnit({ unit: ' 0102 A ' })).toBe('0102 A');
  });
  it('does not infer an apartment from the street number', () => {
    expect(rentManagerUnit({ address: 'Santa Margarita 2981' })).toBeNull();
  });
});