import { describe, it, expect } from 'vitest';
import { applyDateFilter } from '@/shared/lib/date-range-filter';

const now = new Date(2026, 10, 16, 10); // lunes 16/11/2026
const rows = [
  { id: 'dic', scheduled_at: '2026-12-03T15:00:00Z', created_at: '2026-11-01T10:00:00Z' },
  { id: 'hoy', scheduled_at: '2026-11-16T15:00:00Z', created_at: '2026-11-10T10:00:00Z' },
  { id: 'semana', scheduled_at: '2026-11-20T15:00:00Z', created_at: '2026-10-01T10:00:00Z' },
  { id: 'sin', scheduled_at: null, created_at: '2026-11-16T10:00:00Z' },
];
const ids = (r: any[]) => r.map((x) => x.id);

describe('filtro por fecha', () => {
  it('esta semana excluye diciembre y los sin fecha', () => {
    expect(ids(applyDateFilter(rows, { field: 'scheduled', range: 'week', order: 'asc' }, now))).toEqual(['hoy', 'semana']);
  });
  it('este mes por fecha de creación', () => {
    expect(ids(applyDateFilter(rows, { field: 'created', range: 'month', order: 'desc' }, now))).toEqual(['sin', 'hoy', 'dic']);
  });
  it('recolección de llaves lee la fecha corregida primero', () => {
    const r = [{ id: 'k', property_snapshot_json: { fecha_recoleccion_llaves: '2026-01-01' }, property_overrides_json: { fecha_recoleccion_llaves: '2026-11-17' } }];
    expect(ids(applyDateFilter(r, { field: 'keys', range: 'week', order: 'asc' }, now))).toEqual(['k']);
  });
});
