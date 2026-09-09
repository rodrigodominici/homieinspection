import { supabase } from '@/integrations/supabase/client';
import type {
  InspectionPhoto,
  InspectionWorkOrder,
  InspectionWorkOrderItem,
} from '@/lib/types';
import type { WorkOrderItemStatus } from '@/lib/work-order-status';

/** Orden de trabajo con los datos mínimos del inmueble para el listado móvil. */
export interface WorkOrderListRow extends InspectionWorkOrder {
  inspection: {
    id: string;
    property_id: string;
    property_name: string | null;
    address: string | null;
    market: string;
    inspection_type: string;
  } | null;
  total_items: number;
  done_items: number;
}

const ORDER_COLUMNS =
  'id,inspection_id,contractor_id,status,assigned_at,submitted_at,reviewed_at,review_note,contractor_signature_name,contractor_signature_data,contractor_signed_at,created_at,updated_at';

export async function fetchMyWorkOrders(): Promise<WorkOrderListRow[]> {
  const { data, error } = await supabase
    .from('inspection_work_orders')
    .select(
      `${ORDER_COLUMNS}, inspection:inspections(id,property_id,property_name,address,market,inspection_type), items:inspection_work_order_items(id,status)`,
    )
    .order('assigned_at', { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row) => {
    const items = ((row as { items?: { status: string }[] }).items ?? []);
    return {
      ...(row as unknown as InspectionWorkOrder),
      inspection: (row as { inspection?: WorkOrderListRow['inspection'] }).inspection ?? null,
      total_items: items.length,
      done_items: items.filter((i) => i.status === 'done' || i.status === 'not_done').length,
    } as WorkOrderListRow;
  });
}

export interface WorkOrderItemDetail extends InspectionWorkOrderItem {
  repair: {
    id: string;
    title_snapshot: string;
    owner_friendly_name_snapshot: string | null;
    description_snapshot: string | null;
    category_snapshot: string | null;
    unit: string;
    quantity: number;
    notes: string | null;
  } | null;
  photos: InspectionPhoto[];
}

export interface WorkOrderDetail {
  order: InspectionWorkOrder;
  inspection: {
    id: string;
    property_id: string;
    property_name: string | null;
    address: string | null;
    market: string;
    inspection_type: string;
  } | null;
  items: WorkOrderItemDetail[];
}

export async function fetchWorkOrderDetail(workOrderId: string): Promise<WorkOrderDetail> {
  const { data, error } = await supabase
    .from('inspection_work_orders')
    .select(
      `${ORDER_COLUMNS},
       inspection:inspections(id,property_id,property_name,address,market,inspection_type),
       items:inspection_work_order_items(
         id,work_order_id,repair_item_id,status,not_done_reason,comment,actual_cost,completed_at,created_at,updated_at,
         repair:inspection_repair_items(id,title_snapshot,owner_friendly_name_snapshot,description_snapshot,category_snapshot,unit,quantity,notes)
       )`,
    )
    .eq('id', workOrderId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('work_order_not_found');

  const rawItems = ((data as { items?: unknown[] }).items ?? []) as WorkOrderItemDetail[];
  const itemIds = rawItems.map((i) => i.id);

  let photos: InspectionPhoto[] = [];
  if (itemIds.length > 0) {
    const { data: photoRows, error: photoErr } = await supabase
      .from('inspection_photos')
      .select('*')
      .in('work_order_item_id', itemIds)
      .order('created_at', { ascending: true });
    if (photoErr) throw photoErr;
    photos = (photoRows ?? []) as unknown as InspectionPhoto[];
  }

  const items = rawItems
    .map((item) => ({
      ...item,
      photos: photos.filter((p) => p.work_order_item_id === item.id),
    }))
    .sort((a, b) => (a.repair?.title_snapshot ?? '').localeCompare(b.repair?.title_snapshot ?? ''));

  return {
    order: data as unknown as InspectionWorkOrder,
    inspection: (data as { inspection?: WorkOrderDetail['inspection'] }).inspection ?? null,
    items,
  };
}

export async function fetchWorkOrderByInspection(inspectionId: string): Promise<WorkOrderDetail | null> {
  const { data, error } = await supabase
    .from('inspection_work_orders')
    .select('id')
    .eq('inspection_id', inspectionId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return fetchWorkOrderDetail((data as { id: string }).id);
}

export async function updateWorkOrderItem(
  itemId: string,
  patch: {
    status?: WorkOrderItemStatus;
    not_done_reason?: string | null;
    comment?: string | null;
    actual_cost?: number | null;
  },
): Promise<void> {
  const payload: Record<string, unknown> = { ...patch };
  if (patch.status) {
    payload.completed_at = patch.status === 'done' || patch.status === 'not_done' ? new Date().toISOString() : null;
  }
  const { error } = await supabase.from('inspection_work_order_items').update(payload).eq('id', itemId);
  if (error) throw error;
}

/** El contratista abre la orden al empezar a registrar trabajo. */
export async function markWorkOrderInProgress(workOrderId: string): Promise<void> {
  const { error } = await supabase
    .from('inspection_work_orders')
    .update({ status: 'in_progress' })
    .eq('id', workOrderId)
    .in('status', ['open', 'rejected']);
  if (error) throw error;
}

export async function assignWorkOrder(inspectionId: string, contractorId: string): Promise<string> {
  const { data, error } = await supabase.rpc('assign_work_order', {
    p_inspection_id: inspectionId,
    p_contractor_id: contractorId,
  });
  if (error) throw error;
  return data as unknown as string;
}

export async function submitWorkOrder(
  workOrderId: string,
  signerName: string,
  signatureData: string | null,
): Promise<void> {
  const { error } = await supabase.rpc('submit_work_order', {
    p_work_order_id: workOrderId,
    p_signer_name: signerName,
    p_signature_data: signatureData,
  });
  if (error) throw error;
}

export async function reviewWorkOrder(
  workOrderId: string,
  approve: boolean,
  note?: string | null,
): Promise<void> {
  const { error } = await supabase.rpc('review_work_order', {
    p_work_order_id: workOrderId,
    p_approve: approve,
    p_note: note ?? null,
  });
  if (error) throw error;
}
