import { describe, it, expect } from 'vitest';
import { deliveryResult, configured, simulatedReceiver, isHead } from '../../supabase/functions/_shared/rent-manager-delivery';
describe('Rent Manager delivery contract', () => {
  it('keeps pending without a destination', () => expect(configured('', 'test-secret')).toBe(false));
  it('keeps pending without a webhook secret', () => expect(configured('https://example.test', '')).toBe(false));
  it('accepts 200 including duplicate', () => expect(deliveryResult(200, 1).status).toBe('sent'));
  for (const status of [400, 401, 404]) it(`does not retry ${status}`, () => expect(deliveryResult(status, 1).next_attempt_at).toBeNull());
  for (const status of [500, 503, null]) it(`retries ${status}`, () => expect(deliveryResult(status, 1, 0).next_attempt_at).toBe('1970-01-01T00:01:00.000Z'));
  for (const [attempt, seconds] of [[1, 60], [2, 300], [3, 900], [4, 3600], [5, 21600], [8, 21600]]) it(`waits ${seconds}s after attempt ${attempt}`, () => expect(Date.parse(deliveryResult(503, attempt, 0).next_attempt_at ?? '')).toBe(seconds * 1000));
  it('blocks the next event when an earlier event awaits retry', () => {
    const rows = [{id:'a', inspection_id:'hi-1',created_at:'2026-11-10T00:00:00Z',status:'error'}, {id:'b',inspection_id:'hi-1',created_at:'2026-11-10T00:01:00Z',status:'pending'}];
    expect(isHead(rows[1], rows)).toBe(false);
    expect(isHead({...rows[1],inspection_id:'hi-2'}, rows)).toBe(true);
  });
  it('simulates the exact RM identifiers and duplicate contract', () => {
    const seen = new Set<string>();
    const payload = {source:'homie_inspection',event_id:'hi_evt_test',inspection_id:'rm-insp-ejemplo',external_object_id:'rm-inm-ejemplo'};
    expect(simulatedReceiver(payload, seen).body.result).toBe('aplicado');
    expect(simulatedReceiver(payload, seen).body.result).toBe('duplicado');
    expect(payload.event_id).toBe('hi_evt_test');
  });
});