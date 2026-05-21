/**
 * Repair-item mutations for the Executive review workstation.
 * Pure async helpers — no React, no toasts, no state. Callers handle
 * UI feedback and refetch.
 */
import { supabase } from '@/integrations/supabase/client';
import type { InspectionRepairItem, RepairCatalogItem } from '@/lib/types';

export async function fetchActiveCatalog(): Promise<RepairCatalogItem[]> {
  const { data, error } = await supabase
    .from('repair_catalog_items')
    .select('*, repair_catalog_categories(*)')
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return (data ?? []).map((i: any) => ({ ...i, category: i.repair_catalog_categories })) as unknown as RepairCatalogItem[];
}

export async function lookupContractorPrice(
  catalogItemId: string,
  contractorId: string,
): Promise<number> {
  const { data } = await supabase
    .from('repair_catalog_item_contractor_prices')
    .select('price')
    .eq('repair_catalog_item_id', catalogItemId)
    .eq('contractor_id', contractorId)
    .maybeSingle();
  return data ? Number((data as any).price) || 0 : 0;
}

export interface AddRepairFromCatalogArgs {
  inspectionId: string;
  inspectionSectionId: string;
  catalogItem: RepairCatalogItem;
  existingCount: number;
  contractorId: string | null;
  profileId: string | undefined;
}

/** Returns the contractor price applied (0 if none / no contractor). */
export async function addRepairFromCatalog(args: AddRepairFromCatalogArgs): Promise<{ contractorPrice: number; priceSource: 'catalog' | 'none' }> {
  const { inspectionId, inspectionSectionId, catalogItem, existingCount, contractorId, profileId } = args;

  let contractorPrice = 0;
  let priceSource: 'catalog' | 'none' = 'none';
  if (contractorId) {
    contractorPrice = await lookupContractorPrice(catalogItem.id, contractorId);
    if (contractorPrice > 0) priceSource = 'catalog';
  }

  const { error } = await supabase.from('inspection_repair_items').insert({
    inspection_id: inspectionId,
    inspection_section_id: inspectionSectionId,
    repair_catalog_item_id: catalogItem.id,
    title_snapshot: catalogItem.name,
    owner_friendly_name_snapshot: catalogItem.owner_friendly_name,
    description_snapshot: catalogItem.description,
    category_snapshot: catalogItem.category?.name ?? null,
    unit: catalogItem.unit,
    pricing_type: catalogItem.pricing_type,
    quantity: 1,
    unit_price: catalogItem.base_price,
    contractor_unit_price: contractorPrice,
    notes: null,
    visible_to_owner: true,
    sort_order: existingCount,
    payer_role: 'tenant',
    payment_nature: 'required',
    created_by: profileId,
    updated_by: profileId,
  });
  if (error) throw error;
  return { contractorPrice, priceSource };
}

export async function updateRepairItem(
  repairId: string,
  field: string,
  value: unknown,
  profileId: string | undefined,
): Promise<void> {
  const { error } = await supabase
    .from('inspection_repair_items')
    .update({ [field]: value, updated_by: profileId } as any)
    .eq('id', repairId);
  if (error) throw error;
}

export async function deleteRepairItem(repairId: string): Promise<void> {
  const { error } = await supabase.from('inspection_repair_items').delete().eq('id', repairId);
  if (error) throw error;
}

/**
 * Re-apply contractor pricing to every repair item linked to a catalog item.
 * Returns the count of rows actually changed.
 */
export async function rebindContractorPrices(
  inspectionId: string,
  newContractorId: string | null,
  repairs: InspectionRepairItem[],
): Promise<number> {
  await supabase
    .from('inspections')
    .update({ contractor_id: newContractorId })
    .eq('id', inspectionId);

  const catalogIds = Array.from(new Set(
    repairs.map((r) => (r as any).repair_catalog_item_id).filter(Boolean) as string[],
  ));

  const priceMap = new Map<string, number>();
  if (newContractorId && catalogIds.length > 0) {
    const { data: prices } = await supabase
      .from('repair_catalog_item_contractor_prices')
      .select('repair_catalog_item_id, price')
      .eq('contractor_id', newContractorId)
      .in('repair_catalog_item_id', catalogIds);
    for (const p of (prices ?? []) as any[]) {
      priceMap.set(p.repair_catalog_item_id, Number(p.price) || 0);
    }
  }

  let updatedCount = 0;
  await Promise.all(
    repairs
      .filter((r) => (r as any).repair_catalog_item_id)
      .map(async (r) => {
        const catalogId = (r as any).repair_catalog_item_id as string;
        const newPrice = newContractorId ? (priceMap.get(catalogId) ?? 0) : 0;
        if (Number((r as any).contractor_unit_price) === newPrice) return;
        const { error } = await supabase
          .from('inspection_repair_items')
          .update({ contractor_unit_price: newPrice })
          .eq('id', r.id);
        if (!error) updatedCount++;
      }),
  );
  return updatedCount;
}
