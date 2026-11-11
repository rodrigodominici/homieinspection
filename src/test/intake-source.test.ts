import { describe, expect, it } from 'vitest';
import { applySourceDefaults, buildReferenceSpec, isAuthorizedForSource } from '../../supabase/functions/_shared/intake-source';

const secrets = { hubspot: 'hs-secret-123', rent_manager: 'rm-secret-456' };
const rmBody = {
  source: 'rent_manager', event_type: 'inspection.create', payload_version: 'v1',
  external_event_id: 'rm_rm-insp-ejemplo_20261104T150000Z', external_object_id: 'rm-inm-ejemplo',
  data: { rm_inspection_id: 'rm-insp-ejemplo', property_id: 'rm-inm-ejemplo', market: 'CL', inspection_type: 'captacion', fecha_tentativa_recepcion: '2026-11-10', inspector_email: null, executive_email: null },
};

describe('intake secrets per source', () => {
  it('accepts each source only with its own secret', () => {
    expect(isAuthorizedForSource('rent_manager', 'rm-secret-456', secrets)).toBe(true);
    expect(isAuthorizedForSource('hubspot', 'hs-secret-123', secrets)).toBe(true);
  });
  it('rejects the HubSpot secret for rent_manager', () => {
    expect(isAuthorizedForSource('rent_manager', 'hs-secret-123', secrets)).toBe(false);
  });
  it('rejects the Rent Manager secret for hubspot', () => {
    expect(isAuthorizedForSource('hubspot', 'rm-secret-456', secrets)).toBe(false);
  });
  it('rejects anything when the source secret is not configured', () => {
    expect(isAuthorizedForSource('rent_manager', '', { hubspot: 'x', rent_manager: '' })).toBe(false);
  });
});

describe('rent_manager intake defaults', () => {
  it('uses fecha_tentativa_recepcion as scheduled_at', () => {
    expect(applySourceDefaults('rent_manager', rmBody.data).scheduled_at).toBe('2026-11-10');
  });
  it('does not touch HubSpot payloads', () => {
    expect(applySourceDefaults('hubspot', { fecha_tentativa_recepcion: '2026-11-10' }).scheduled_at).toBeUndefined();
  });
});

describe('external reference', () => {
  it('stores rent_manager captacion with rm_inspection_id, id unchanged', () => {
    const spec = buildReferenceSpec('rent_manager', rmBody.external_object_id, rmBody, { inspection_type: 'captacion', market: 'CL' });
    expect(spec).toMatchObject({ provider: 'rent_manager', external_object_type: 'captacion', external_object_id: 'rm-inm-ejemplo', extraMetadata: { rm_inspection_id: 'rm-insp-ejemplo' } });
  });
  it('keeps HubSpot MX captación as deal and check-out as lease contract', () => {
    expect(buildReferenceSpec('hubspot', 1, {}, { inspection_type: 'captacion', market: 'MX' })?.external_object_type).toBe('deal');
    expect(buildReferenceSpec('hubspot', 1, {}, { inspection_type: 'check_out', market: 'CL' })?.external_object_type).toBe('lease_contract');
  });
});

import { readTestFlag } from '../../supabase/functions/_shared/test-inspection';
describe('es_prueba flag', () => {
  it('is false when es_prueba is missing', () => {
    expect(readTestFlag('rent_manager', rmBody)).toBe(false);
  });
  it('is true only when rent_manager sends es_prueba true', () => {
    expect(readTestFlag('rent_manager', { ...rmBody, es_prueba: true })).toBe(true);
    expect(readTestFlag('rent_manager', { ...rmBody, data: { ...rmBody.data, es_prueba: true } })).toBe(true);
  });
  it('is ignored for hubspot', () => {
    expect(readTestFlag('hubspot', { es_prueba: true })).toBe(false);
  });
});
