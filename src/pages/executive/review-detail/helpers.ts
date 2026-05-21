/**
 * Shared formatting + tiny presentational helpers for the Executive
 * review-detail workstation. Extracted from `ExecutiveReviewDetail.tsx`
 * with no behavior change.
 */
import { cn } from '@/lib/utils';
import type { InspectionSection } from '@/lib/types';

export const fmt = (n: number) =>
  n.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

export const fmtCurrency = (n: number) => `$${fmt(n)}`;

export function statusLabel(value: string | null) {
  if (!value) return null;
  const labels: Record<string, { text: string; cls: string }> = {
    bueno: { text: 'Bueno', cls: 'text-[hsl(var(--status-good))]' },
    regular: { text: 'Regular', cls: 'text-[hsl(var(--status-regular))]' },
    malo: { text: 'Malo', cls: 'text-[hsl(var(--status-bad))] font-semibold' },
    no_aplica: { text: 'No Aplica', cls: 'text-[hsl(var(--status-na))]' },
  };
  return labels[value] ?? { text: value, cls: '' };
}

/** Breakdown of repair totals per section, shown inside a tooltip. */
export function SectionTotalsBreakdown({
  sections, bySection, field, activeId,
}: {
  sections: InspectionSection[];
  bySection: Record<string, { owner: number; tenant: number; total: number }>;
  field: 'owner' | 'tenant' | 'total';
  activeId: string | null;
}) {
  const rows = sections
    .map((s) => ({ id: s.id, title: s.section_title, value: bySection[s.id]?.[field] ?? 0 }))
    .filter((r) => r.value > 0);
  if (rows.length === 0) return <p className="text-xs">Sin reparaciones</p>;
  return (
    <div className="space-y-1 min-w-[220px]">
      <p className="text-[10px] uppercase tracking-wide opacity-70 mb-1">Por sección</p>
      {rows.map((r) => (
        <div
          key={r.id}
          className={cn(
            'flex items-center justify-between gap-3 text-xs',
            r.id === activeId && 'font-semibold underline',
          )}
        >
          <span className="truncate">{r.title}</span>
          <span className="font-mono">{fmtCurrency(r.value)}</span>
        </div>
      ))}
    </div>
  );
}
