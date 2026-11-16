import { describe, it, expect } from 'vitest';
import { buildParkingStorageOverrides } from '@/lib/parking-storage-overrides';
import { getEffectiveSnapshot } from '@/lib/inspection-utils';

describe('parking/storage correction', () => {
  it('RE0004803: "26 - 39" from payload becomes a single parking #26', () => {
    const snapshot = { parking_number: '26 - 39', has_parking: true, has_storage: false };
    const overrides = buildParkingStorageOverrides(null, '26', '');
    const eff = getEffectiveSnapshot({ property_snapshot_json: snapshot, property_overrides_json: overrides } as never);
    expect(eff.parking_number).toBe('26');
    expect(eff.has_parking).toBe(true);
    expect(eff.has_storage).toBe(false);
    expect(snapshot.parking_number).toBe('26 - 39');
  });
  it('keeps other overrides such as the key date', () => {
    const o = buildParkingStorageOverrides({ fecha_recoleccion_llaves: '2026-11-20' }, '', '5');
    expect(o.fecha_recoleccion_llaves).toBe('2026-11-20');
    expect(o.has_parking).toBe(false);
    expect(o.storage_number).toBe('5');
  });
});
