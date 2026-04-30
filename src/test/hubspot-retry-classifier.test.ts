import { describe, it, expect } from 'vitest';
import { classifyOutboundFailure } from '@/lib/hubspot-retry-classifier';

describe('classifyOutboundFailure', () => {
  it('returns not_failed for skipped rows', () => {
    expect(classifyOutboundFailure({ status: 'skipped', error_message: 'missing_key_date' })).toBe('not_failed');
  });
  it('returns not_failed for success rows', () => {
    expect(classifyOutboundFailure({ status: 'success', response_status: 200 })).toBe('not_failed');
  });
  it('classifies HTTP 429 as retryable', () => {
    expect(classifyOutboundFailure({ status: 'error', response_status: 429, error_message: 'hubspot_patch_failed_429' })).toBe('retryable');
  });
  it('classifies HTTP 503 as retryable', () => {
    expect(classifyOutboundFailure({ status: 'error', response_status: 503, error_message: 'hubspot_patch_failed_503' })).toBe('retryable');
  });
  it('classifies request_failed: as retryable (network)', () => {
    expect(classifyOutboundFailure({ status: 'error', response_status: null, error_message: 'request_failed: fetch failed' })).toBe('retryable');
  });
  it('classifies missing token as non_retryable', () => {
    expect(classifyOutboundFailure({ status: 'error', error_message: 'hubspot_private_app_token_missing' })).toBe('non_retryable');
  });
  it('classifies no_active_external_reference as non_retryable', () => {
    expect(classifyOutboundFailure({ status: 'error', error_message: 'no_active_external_reference' })).toBe('non_retryable');
  });
  it('classifies HTTP 400 as non_retryable', () => {
    expect(classifyOutboundFailure({ status: 'error', response_status: 400, error_message: 'hubspot_patch_failed_400' })).toBe('non_retryable');
  });
  it('deterministic deny-list beats transient HTTP code', () => {
    expect(classifyOutboundFailure({ status: 'error', response_status: 500, error_message: 'hubspot_private_app_token_missing' })).toBe('non_retryable');
  });
});
