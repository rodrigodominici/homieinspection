import { describe, expect, it, vi } from 'vitest';
import { enrichCaptacionUnit, unitNumber } from '../../supabase/functions/_shared/hubspot-unit';
import { normalizeIncomingPayload } from '../../supabase/functions/_shared/inspection-generator';

describe('HubSpot captación apartment numbers', () => {
  it('maps the verified HubSpot apartment field into the snapshot payload', () => {
    expect(normalizeIncomingPayload({ property_id: 'test', market: 'CL', inspection_type: 'captacion', unit_number: '', numero_de_departamento: '707' }).unit_number).toBe('707');
  });
  it('recovers a missing apartment from the correct Chilean deal', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ properties: { numero_de_departamento: '217' } })));
    const result = await enrichCaptacionUnit({ market: 'CL', inspection_type: 'captacion' }, 'hs_deal_65899629415', 'test-token', fetcher);
    expect(result.unit_number).toBe('217');
    expect(fetcher.mock.calls[0][0]).toBe('https://api.hubapi.com/crm/objects/2026-09/deals/65899629415?properties=numero_de_departamento');
  });
  it('preserves an existing apartment without calling HubSpot', async () => {
    const fetcher = vi.fn();
    expect((await enrichCaptacionUnit({ market: 'CL', inspection_type: 'captacion', unit_number: '213' }, '1', 'test-token', fetcher)).unit_number).toBe('213');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('does not fetch Chilean deal properties for Mexico or check-ins', async () => {
    const fetcher = vi.fn();
    await enrichCaptacionUnit({ market: 'MX', inspection_type: 'captacion' }, '1', 'test-token', fetcher);
    await enrichCaptacionUnit({ market: 'CL', inspection_type: 'check_in' }, '1', 'test-token', fetcher);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('keeps unit numbers as text including leading zeroes and letters', () => {
    expect(unitNumber({ numero_de_departamento: '0102 A' })).toBe('0102 A');
  });
  it('does not fabricate an apartment if HubSpot has no value', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ properties: { numero_de_departamento: null } })));
    expect((await enrichCaptacionUnit({ market: 'CL', inspection_type: 'captacion' }, '1', 'test-token', fetcher)).unit_number).toBeUndefined();
  });
});