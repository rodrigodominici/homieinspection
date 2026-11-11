import { describe, it, expect } from 'vitest';
import { publicAppOrigin, reportLinks, publicPhotoUrl } from '../../supabase/functions/_shared/rent-manager-links';

describe('Rent Manager production URLs', () => {
  it('uses the public HI domain rather than the dispatcher origin', () => {
    expect(publicAppOrigin()).toBe('https://app.inspection.homie.mx');
  });
  it('separates the protected internal report from the owner public report', () => {
    expect(reportLinks(publicAppOrigin(), 'hi-123', 'CL-456', { owner: 'owner-token', tenant: 'tenant-token' })).toEqual({
      report_url: 'https://app.inspection.homie.mx/inspections/hi-123',
      owner_url: 'https://app.inspection.homie.mx/reportes/CL-456/owner-token',
    });
  });
  it('never replaces a missing owner link with the tenant link', () => {
    expect(reportLinks(publicAppOrigin(), 'hi-123', 'CL-456', { tenant: 'tenant-token' }).owner_url).toBeNull();
  });
  it('rejects local app URLs', () => {
    expect(() => publicAppOrigin('http://localhost:8080')).toThrow('invalid_public_app_origin');
    expect(() => publicAppOrigin('https://127.0.0.1')).toThrow('invalid_public_app_origin');
  });
  it('blocks local photo URLs in production but retains hosted signed URLs', () => {
    expect(() => publicPhotoUrl('http://localhost:8001/storage/v1/object/sign/example', false)).toThrow('invalid_public_photo_url');
    const url = 'https://qlbprsnnjbzfixjrvfuh.supabase.co/storage/v1/object/sign/inspection-photos/example?token=example';
    expect(publicPhotoUrl(url, false)).toBe(url);
  });
});