import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import type { QuotationRevision, RevisionValues } from '@/lib/quotation-revision';

export async function fetchQuotationRevisions(inspectionId: string): Promise<QuotationRevision[]> {
  const { data, error } = await supabase.from('quotation_work_order_revisions')
    .select('*,changes:quotation_work_order_changes(*)').eq('inspection_id', inspectionId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as QuotationRevision[];
}
export async function startQuotationRevision(inspectionId: string) {
  const { data, error } = await supabase.rpc('start_quotation_revision', { p_inspection_id: inspectionId });
  if (error) throw error;
  return data;
}
export async function saveQuotationChange(revisionId: string, repairId: string | null, kind: 'add' | 'modify' | 'remove', values: RevisionValues | null, reason: string) {
  const { error } = await supabase.rpc('save_quotation_revision_change', {
    p_revision_id: revisionId, p_repair_item_id: repairId as unknown as string, p_kind: kind, p_values: values as unknown as Json, p_reason: reason,
  });
  if (error) throw error;
}
export async function discardQuotationRevision(revisionId: string, changeId?: string) {
  const { error } = await supabase.rpc('discard_quotation_revision', { p_revision_id: revisionId, ...(changeId ? { p_change_id: changeId } : {}) });
  if (error) throw error;
}
export async function submitQuotationRevision(revisionId: string, reason: string) {
  const { data, error } = await supabase.rpc('submit_quotation_revision', { p_revision_id: revisionId, p_reason: reason });
  if (error) throw error;
  return data;
}