export interface HistoricalRepair {
  id?: string;
  name?: string;
  description?: string | null;
  quantity?: number;
  unit?: string;
  unit_price?: number;
  subtotal?: number;
  payer_role?: string;
  payment_nature?: string;
  is_pending_quote?: boolean;
}

export interface QuotationSnapshot {
  property?: { property_name?: string; property_id?: string; address?: string; market?: string };
  sections?: { id?: string; title?: string; repairs?: HistoricalRepair[] }[];
  tax_config?: { enabled?: boolean; percentage?: number; label?: string; currency?: string } | null;
  discount?: { amount?: number; reason?: string; type?: string; value?: number; amount_owner?: number; amount_tenant?: number } | null;
  quotation_totals?: { subtotal: number; owner: number; tenant: number; discount: number; tax: number; total: number };
}

export interface HistoricalDecision {
  repair_item_id: string;
  decision: string;
  comment: string | null;
  submitter_name?: string | null;
  submitted_at?: string;
}

export function snapshotRepairs(payload: QuotationSnapshot) {
  return (payload.sections ?? []).flatMap((section, si) => (section.repairs ?? []).map((r, ri) => ({
    ...r, section: section.title ?? 'Otros', key: r.id ?? `legacy-${si}-${ri}`,
  })));
}

export function historicalAmount(r: HistoricalRepair): number {
  if (r.is_pending_quote) return 0;
  return r.subtotal == null ? Number(r.quantity ?? 0) * Number(r.unit_price ?? 0) : Number(r.subtotal);
}

export function snapshotTotals(payload: QuotationSnapshot) {
  if (payload.quotation_totals) return payload.quotation_totals;
  const repairs = snapshotRepairs(payload);
  const owner = repairs.filter(r => r.payer_role !== 'tenant').reduce((s, r) => s + historicalAmount(r), 0);
  const tenant = repairs.filter(r => r.payer_role === 'tenant').reduce((s, r) => s + historicalAmount(r), 0);
  const discount = Math.min(owner + tenant, Math.max(0, Number(payload.discount?.amount ?? 0)));
  const base = owner + tenant - discount;
  const tax = payload.tax_config?.enabled ? Math.round(base * Number(payload.tax_config.percentage ?? 0) / 100) : 0;
  return { subtotal: owner + tenant, owner, tenant, discount, tax, total: base + tax };
}

const fields = ['name', 'description', 'quantity', 'unit', 'unit_price', 'payer_role', 'payment_nature', 'is_pending_quote', 'section'] as const;
export function compareQuotations(before: QuotationSnapshot, after: QuotationSnapshot) {
  const oldRows = snapshotRepairs(before);
  const newRows = snapshotRepairs(after);
  const oldById = new Map(oldRows.filter(r => r.id).map(r => [r.id, r]));
  const newIds = new Set(newRows.filter(r => r.id).map(r => r.id));
  const changes: { kind: 'added' | 'removed' | 'changed'; name: string; fields: string[]; before?: typeof oldRows[number]; after?: typeof newRows[number] }[] = [];
  for (const r of newRows) {
    const old = r.id ? oldById.get(r.id) : undefined;
    if (!old) changes.push({ kind: 'added', name: r.name ?? 'Partida', fields: [], after: r });
    else {
      const changed = fields.filter(f => (old[f] ?? null) !== (r[f] ?? null));
      if (changed.length) changes.push({ kind: 'changed', name: r.name ?? 'Partida', fields: changed, before: old, after: r });
    }
  }
  for (const r of oldRows) {
    if (!r.id || !newIds.has(r.id)) changes.push({ kind: 'removed', name: r.name ?? 'Partida', fields: [], before: r });
  }
  return { changes, totalBefore: snapshotTotals(before).total, totalAfter: snapshotTotals(after).total,
    discountChanged: JSON.stringify(before.discount ?? null) !== JSON.stringify(after.discount ?? null),
    taxChanged: JSON.stringify(before.tax_config ?? null) !== JSON.stringify(after.tax_config ?? null),
    legacy: oldRows.some(r => !r.id) || newRows.some(r => !r.id) };
}

export const decisionLabel = (decision?: string) => ({ accepted: 'Aprobada', rejected: 'Rechazada', observed: 'Con observaciones' }[decision ?? ''] ?? 'Sin respuesta');