import { describe, expect, it } from 'vitest';
import { resolveHubSpotProperty } from '../../supabase/functions/hubspot-update-inspection/property-map';

describe('HubSpot key collection date destination', () => {
  it('uses the verified Chilean deal field for captaciones', () => {
    expect(resolveHubSpotProperty('key_collection_date', 'captacion', 'CL')).toBe('fecha_recoleccion_llaves');
  });
  it('keeps Mexican captaciones on the technical visit field', () => {
    expect(resolveHubSpotProperty('key_collection_date', 'captacion', 'MX')).toBe('fecha_de_visita_tecnica');
  });
  it('keeps Chilean check-outs on the lease contract field', () => {
    expect(resolveHubSpotProperty('key_collection_date', 'check_out', 'CL')).toBe('fecha_de_recoleccion_de_llaves');
  });
  it('keeps Mexican check-outs on the lease contract field', () => {
    expect(resolveHubSpotProperty('key_collection_date', 'check_out', 'MX')).toBe('fecha_de_recoleccion_de_llaves');
  });
});