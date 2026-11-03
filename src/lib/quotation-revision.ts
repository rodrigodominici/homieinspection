export interface RevisionValues {
  id?: string;
  inspection_section_id?: string;
  title_snapshot: string;
  description_snapshot?: string | null;
  quantity: number;
  unit: string;
  unit_price: number;
  contractor_unit_price?: number;
  payer_role: 'owner' | 'tenant';
  payment_nature?: 'required' | 'optional';
  is_pending_quote?: boolean;
}
export interface RevisionChange {
  id: string;
  repair_item_id: string;
  kind: 'add' | 'modify' | 'remove';
  before_json: RevisionValues | null;
  after_json: RevisionValues | null;
  decision: 'accepted' | 'rejected' | null;
  comment: string | null;
  applied_at: string | null;
}
export interface QuotationRevision {
  id: string;
  status: 'draft' | 'awaiting_approval' | 'resolved' | 'cancelled';
  reason: string;
  created_at: string;
  submitted_at: string | null;
  submitter_name: string | null;
  changes: RevisionChange[];
}
export function revisionAmount(values: RevisionValues | null) {
  return !values || values.is_pending_quote ? 0 : Number(values.quantity) * Number(values.unit_price);
}
export function revisionDifference(change: RevisionChange) {
  return revisionAmount(change.after_json) - revisionAmount(change.before_json);
}
export function canReviseWork(status: string, archived = false) { return status !== 'done' && !archived; }
export function revisionResult(change: RevisionChange) {
  return change.decision === 'accepted' ? change.after_json : change.before_json;
}
export const revisionError = (error: unknown) => {
  const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
  const labels: Record<string, string> = {
    completed_work_is_immutable: 'El trabajo ya está terminado y no se puede modificar.',
    revision_conflict: 'La partida cambió mientras preparabas la revisión. Volvé a cargar los datos.',
    use_quotation_revision: 'Esta inspección ya tiene OT. Usá «Modificar cotización» para proponer cambios.',
    quotation_change_awaiting_approval: 'Hay cambios esperando aprobación del inversionista.',
    revision_reason_required: 'Ingresá un motivo para los cambios.',
    revision_has_no_changes: 'Agregá al menos un cambio antes de enviar.',
    work_order_not_open: 'La OT está cerrada o en revisión y no admite cambios.',
    revision_not_editable: 'Esta revisión ya no se puede editar.',
    no_changes: 'No modificaste ningún valor de la partida.',
    invalid_repair_values: 'Revisá la descripción, sección, cantidades, precios y responsable.',
    not_authorized: 'No tenés permisos para modificar esta cotización.',
  };
  return Object.entries(labels).find(([key]) => message.includes(key))?.[1] ?? 'No se pudo completar la operación. Intentá nuevamente.';
};