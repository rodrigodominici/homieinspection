import { describe, expect, it } from 'vitest';
import { marketingPhotosReady } from '../../supabase/functions/_shared/marketing-photo-message';
describe('marketing notification readiness', () => {
  it('requires all 10 photos saved and the marketing section complete', () => {
    expect(marketingPhotosReady('captacion', 'completed', 9)).toBe(false);
    expect(marketingPhotosReady('captacion', 'in_progress', 10)).toBe(false);
    expect(marketingPhotosReady('captacion', 'completed', 10)).toBe(true);
  });
  it('does not announce check-in or check-out evidence as marketing photos', () => {
    expect(marketingPhotosReady('check_in', 'completed', 10)).toBe(false);
    expect(marketingPhotosReady('check_out', 'completed', 10)).toBe(false);
  });
});