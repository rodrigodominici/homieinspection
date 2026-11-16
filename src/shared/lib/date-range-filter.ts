import { useEffect, useState } from 'react';

export type DateField = 'scheduled' | 'created' | 'keys';
export type DateRange = 'all' | 'today' | 'week' | 'month' | 'custom';
export interface DateFilterState { field: DateField; range: DateRange; from?: string; to?: string; order: 'asc' | 'desc' }

export const DEFAULT_DATE_FILTER: DateFilterState = { field: 'scheduled', range: 'all', order: 'desc' };

interface Row { scheduled_at?: string | null; created_at?: string | null; property_snapshot_json?: any; property_overrides_json?: any }

export function rowDate(row: Row, field: DateField): Date | null {
  const raw = field === 'created' ? row.created_at
    : field === 'scheduled' ? row.scheduled_at
    : (row.property_overrides_json?.fecha_recoleccion_llaves ?? row.property_snapshot_json?.fecha_recoleccion_llaves);
  if (!raw) return null;
  const s = String(raw);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00`) : new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** Inicio (incluido) y fin (excluido) del rango; semana de lunes a domingo. */
export function rangeBounds(state: DateFilterState, now = new Date()): [Date, Date] | null {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const today = startOfDay(now);
  const add = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  switch (state.range) {
    case 'today': return [today, add(today, 1)];
    case 'week': { const s = add(today, -((today.getDay() + 6) % 7)); return [s, add(s, 7)]; }
    case 'month': return [new Date(today.getFullYear(), today.getMonth(), 1), new Date(today.getFullYear(), today.getMonth() + 1, 1)];
    case 'custom': {
      if (!state.from && !state.to) return null;
      const f = state.from ? new Date(`${state.from}T00:00:00`) : new Date(0);
      const t = state.to ? add(new Date(`${state.to}T00:00:00`), 1) : new Date(8.64e15);
      return [f, t];
    }
    default: return null;
  }
}

export function applyDateFilter<T extends Row>(rows: T[], state: DateFilterState, now = new Date()): T[] {
  const b = rangeBounds(state, now);
  const out = b ? rows.filter((r) => { const d = rowDate(r, state.field); return !!d && d >= b[0] && d < b[1]; }) : [...rows];
  const dir = state.order === 'asc' ? 1 : -1;
  return out.sort((a, c) => {
    const x = rowDate(a, state.field)?.getTime(), y = rowDate(c, state.field)?.getTime();
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return (x - y) * dir;
  });
}

/** Estado persistido durante la sesión, por lista. */
export function useDateFilter(key: string) {
  const storageKey = `date-filter:${key}`;
  const [state, setState] = useState<DateFilterState>(() => {
    try { return { ...DEFAULT_DATE_FILTER, ...JSON.parse(sessionStorage.getItem(storageKey) || '{}') }; } catch { return DEFAULT_DATE_FILTER; }
  });
  useEffect(() => { sessionStorage.setItem(storageKey, JSON.stringify(state)); }, [state, storageKey]);
  return [state, setState] as const;
}
