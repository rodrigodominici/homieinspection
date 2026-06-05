/**
 * Quotation-level discount persistence.
 *
 * Storage: `inspection_quotation_discounts` — append-only history; the
 * single active row per inspection is enforced by a unique partial index.
 * Applying a new discount supersedes the previous active row.
 *
 * Audit: every action also writes to `inspection_audit_log`.
 */
import { supabase } from '@/integrations/supabase/client';
import type { DiscountType, QuotationDiscountInput } from '@/lib/quotation-discount';

export interface QuotationDiscountRow {
  id: string;
  inspection_id: string;
  discount_type: DiscountType;
  discount_value: number;
  discount_reason: string | null;
  is_active: boolean;
  applied_by: string | null;
  applied_at: string;
  removed_by: string | null;
  removed_at: string | null;
  superseded_by_id: string | null;
  created_at: string;
  updated_at: string;
}

const TABLE = 'inspection_quotation_discounts' as const;

export async function fetchActiveDiscount(
  inspectionId: string,
): Promise<QuotationDiscountRow | null> {
  const { data, error } = await supabase
    .from(TABLE as any)
    .select('*')
    .eq('inspection_id', inspectionId)
    .eq('is_active', true)
    .maybeSingle();
  if (error) {
    console.error('[quotation-discount] fetchActiveDiscount', error);
    return null;
  }
  return (data as unknown as QuotationDiscountRow) ?? null;
}

async function writeAudit(args: {
  inspectionId: string;
  profileId: string | undefined;
  action: 'quotation_discount_applied' | 'quotation_discount_updated' | 'quotation_discount_removed';
  note: string;
}) {
  await supabase.from('inspection_audit_log').insert({
    inspection_id: args.inspectionId,
    performed_by: args.profileId ?? null,
    action: args.action,
    note: args.note,
  } as any);
}

function describe(input: QuotationDiscountInput): string {
  return input.type === 'percentage' ? `${input.value}%` : `$${input.value}`;
}

export async function applyDiscount(args: {
  inspectionId: string;
  input: QuotationDiscountInput;
  profileId: string | undefined;
}): Promise<QuotationDiscountRow> {
  const { inspectionId, input, profileId } = args;

  const prior = await fetchActiveDiscount(inspectionId);

  const nowIso = new Date().toISOString();
  const { data: inserted, error: insertErr } = await supabase
    .from(TABLE as any)
    .insert({
      inspection_id: inspectionId,
      discount_type: input.type,
      discount_value: input.value,
      discount_reason: input.reason?.trim() || null,
      is_active: false, // flip to true after retiring the prior row
      applied_by: profileId ?? null,
      applied_at: nowIso,
    } as any)
    .select('*')
    .single();
  if (insertErr || !inserted) throw insertErr ?? new Error('insert_failed');

  const insertedRow = inserted as unknown as QuotationDiscountRow;

  if (prior) {
    const { error: supErr } = await supabase
      .from(TABLE as any)
      .update({
        is_active: false,
        superseded_by_id: insertedRow.id,
      } as any)
      .eq('id', prior.id);
    if (supErr) throw supErr;
  }

  const { error: actErr, data: activated } = await supabase
    .from(TABLE as any)
    .update({ is_active: true } as any)
    .eq('id', insertedRow.id)
    .select('*')
    .single();
  if (actErr || !activated) throw actErr ?? new Error('activate_failed');

  await writeAudit({
    inspectionId,
    profileId,
    action: prior ? 'quotation_discount_updated' : 'quotation_discount_applied',
    note: prior
      ? `Descuento actualizado: ${describe({ type: prior.discount_type, value: prior.discount_value })} → ${describe(input)}${input.reason ? ` · ${input.reason}` : ''}`
      : `Descuento aplicado: ${describe(input)}${input.reason ? ` · ${input.reason}` : ''}`,
  });

  return activated as unknown as QuotationDiscountRow;
}

export async function removeDiscount(args: {
  inspectionId: string;
  profileId: string | undefined;
}): Promise<void> {
  const { inspectionId, profileId } = args;
  const prior = await fetchActiveDiscount(inspectionId);
  if (!prior) return;

  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from(TABLE as any)
    .update({
      is_active: false,
      removed_by: profileId ?? null,
      removed_at: nowIso,
    } as any)
    .eq('id', prior.id);
  if (error) throw error;

  await writeAudit({
    inspectionId,
    profileId,
    action: 'quotation_discount_removed',
    note: `Descuento eliminado: ${describe({ type: prior.discount_type, value: prior.discount_value })}`,
  });
}
