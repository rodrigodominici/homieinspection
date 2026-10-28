export interface PricedRepair {
  is_pending_quote?: boolean;
  quantity: number;
  unit_price: number;
  contractor_unit_price?: number;
}

export const canQuoteRepair = (repair: { is_pending_quote?: boolean }) => !repair.is_pending_quote;
export const quotedAmount = (repair: PricedRepair) =>
  canQuoteRepair(repair) ? (Number(repair.quantity) || 0) * (Number(repair.unit_price) || 0) : 0;
export const contractorAmount = (repair: PricedRepair) =>
  canQuoteRepair(repair) ? (Number(repair.quantity) || 0) * (Number(repair.contractor_unit_price) || 0) : 0;
export function repairUpdate(field: string, value: unknown) {
  return field === 'unit_price'
    ? { unit_price: value, is_pending_quote: false }
    : { [field]: value };
}