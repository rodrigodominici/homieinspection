// Rent Manager's live listing response stores the apartment in location.unit.
export function rentManagerUnit(location: Record<string, unknown>): string | null {
  const value = location.unit;
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}