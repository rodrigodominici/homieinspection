import { describe, it, expect } from 'vitest';
import { quotationFileTitle } from '@/lib/quotation-print';
describe('quotationFileTitle', () => {
  it('incluye la dirección del inmueble en el nombre del PDF', () => {
    expect(quotationFileTitle('Cotización Propietario', 'San Martín 974, D 707')).toBe('Cotización Propietario - San Martín 974, D 707');
  });
  it('usa el nombre del inmueble si no hay dirección', () => {
    expect(quotationFileTitle('Cotización Inquilino', null, 'Depto Centro')).toBe('Cotización Inquilino - Depto Centro');
  });
});
