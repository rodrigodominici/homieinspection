import { supabase } from '@/integrations/supabase/client';
import { compressImage } from '@/shared/lib/inspection-photos';

export interface WorkOrderProposal {
  id: string;
  work_order_id: string;
  inspection_id: string;
  title: string;
  comment: string | null;
  proposed_cost: number;
  photo_path: string | null;
  status: 'pending' | 'approved' | 'rejected';
  decision_note: string | null;
  repair_item_id: string | null;
  created_at: string;
}

// La tabla es nueva; se accede sin tipado estricto.
const table = () => (supabase as unknown as { from: (t: string) => any }).from('work_order_proposals');

export async function fetchProposals(workOrderId: string): Promise<WorkOrderProposal[]> {
  const { data, error } = await table().select('*').eq('work_order_id', workOrderId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as WorkOrderProposal[];
}

export async function createProposal(input: {
  workOrderId: string; inspectionId: string; title: string; comment: string; cost: number; photo: File | null;
}): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  let photoPath: string | null = null;
  if (input.photo) {
    const blob = (await compressImage(input.photo)) ?? input.photo;
    photoPath = `inspections/${input.inspectionId}/proposals/${crypto.randomUUID()}.jpg`;
    const { error: upErr } = await supabase.storage.from('inspection-photos').upload(photoPath, blob, { contentType: 'image/jpeg' });
    if (upErr) throw upErr;
  }
  const { error } = await table().insert({
    work_order_id: input.workOrderId,
    inspection_id: input.inspectionId,
    title: input.title.trim(),
    comment: input.comment.trim() || null,
    proposed_cost: input.cost,
    photo_path: photoPath,
    created_by: auth.user?.id,
  });
  if (error) throw error;
}

export async function decideProposal(id: string, approve: boolean, ownerPrice: number | null, note: string | null): Promise<void> {
  const { error } = await (supabase.rpc as unknown as (f: string, a: object) => Promise<{ error: Error | null }>)(
    'decide_work_order_proposal', { p_proposal_id: id, p_approve: approve, p_owner_price: ownerPrice, p_note: note });
  if (error) throw error;
}
