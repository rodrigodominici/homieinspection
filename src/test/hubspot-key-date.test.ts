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
  it('sends Mexican check-out coordination to Fecha de Devolución de Llaves', () => {
    expect(resolveHubSpotProperty('key_collection_date', 'check_out', 'MX')).toBe('fecha_de_devolucion_de_llaves');
  });
  it('holds the Mexican check-out received date until its field is defined', () => {
    expect(resolveHubSpotProperty('checkout_received', 'check_out', 'MX')).toBeNull();
  });
});
import { resolveAssigneeProperties } from '../../supabase/functions/hubspot-update-inspection/property-map';
describe('assignees to HubSpot', () => {
  it('Chile check-out sends receptor and ejecutivo_de_operaciones', () => {
    expect(resolveAssigneeProperties('check_out', 'CL', { receptor: '1', executive: '2' }))
      .toEqual({ receptor: '1', ejecutivo_de_operaciones: '2' });
  });
  it('does not send for captación or Mexico', () => {
    expect(resolveAssigneeProperties('captacion', 'CL', { receptor: '1', executive: '2' })).toEqual({});
    expect(resolveAssigneeProperties('check_out', 'MX', { receptor: '1', executive: '2' })).toEqual({});
  });
});
