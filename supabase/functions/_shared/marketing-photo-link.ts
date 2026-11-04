export const MARKETING_LINK_LIFETIME_SECONDS = 7 * 24 * 60 * 60;
const encoder = new TextEncoder();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function signingKey(secret: string) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
export async function createMarketingLinkToken(id: string, secret: string, now = Math.floor(Date.now() / 1000)) {
  if (!uuid.test(id) || !secret) throw new Error('invalid_link_configuration');
  const expires = now + MARKETING_LINK_LIFETIME_SECONDS;
  const payload = `${id}.${expires}`;
  const signature = await crypto.subtle.sign('HMAC', await signingKey(secret), encoder.encode(payload));
  return { token: `${payload}.${hex(signature)}`, expires };
}
export async function verifyMarketingLinkToken(token: string, secret: string, now = Math.floor(Date.now() / 1000)) {
  const [id, timestamp, signature, extra] = token.split('.');
  const expires = Number(timestamp);
  if (!secret || extra || !id || !uuid.test(id) || !/^\d+$/.test(timestamp ?? '') || !Number.isSafeInteger(expires) || expires <= now || expires > now + MARKETING_LINK_LIFETIME_SECONDS || !/^[a-f0-9]{64}$/.test(signature ?? '')) return null;
  const bytes = Uint8Array.from(signature.match(/.{2}/g) ?? [], value => parseInt(value, 16));
  const valid = await crypto.subtle.verify('HMAC', await signingKey(secret), bytes, encoder.encode(`${id}.${timestamp}`));
  return valid ? { id, expires } : null;
}