/** Builds admin overrides for parking/storage numbers; an empty value means the property has none. */
export function buildParkingStorageOverrides(
  current: Record<string, unknown> | null | undefined,
  parking: string,
  storage: string,
): Record<string, unknown> {
  const p = parking.trim();
  const s = storage.trim();
  return {
    ...(current ?? {}),
    parking_number: p || null,
    has_parking: p.length > 0,
    storage_number: s || null,
    has_storage: s.length > 0,
  };
}
