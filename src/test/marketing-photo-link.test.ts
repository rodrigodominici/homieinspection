import { describe, expect, it } from 'vitest';
import { createMarketingLinkToken, verifyMarketingLinkToken } from '../../supabase/functions/_shared/marketing-photo-link';
const id = 'be4cb30c-84d2-4f50-abc3-fb8286b8beaf';
const secret = 'test-only-signing-key';
describe('shared marketing link', () => {
  it('expires exactly seven days after creation', async () => {
    const link = await createMarketingLinkToken(id, secret, 1000);
    expect(link.expires).toBe(605800);
    expect(await verifyMarketingLinkToken(link.token, secret, 605799)).toEqual({ id, expires: 605800 });
    expect(await verifyMarketingLinkToken(link.token, secret, 605800)).toBeNull();
  });
  it('does not allow changing the property or expiry', async () => {
    const link = await createMarketingLinkToken(id, secret, 1000);
    expect(await verifyMarketingLinkToken(link.token.replace(id, 'ae4cb30c-84d2-4f50-abc3-fb8286b8beaf'), secret, 1000)).toBeNull();
    expect(await verifyMarketingLinkToken(link.token.replace('.605800.', '.605801.'), secret, 1001)).toBeNull();
    expect(await verifyMarketingLinkToken(link.token, 'different-key', 1000)).toBeNull();
  });
});