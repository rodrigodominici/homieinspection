// Core domain types for Homie Inspection

export type UserRole = 'admin' | 'inspector' | 'executive' | 'pending';

export type InspectionStatus =
  | 'pending'
  | 'pending_assignment'
  | 'assigned'
  | 'in_progress'
  | 'submitted'
  | 'in_review'
  | 'needs_changes'
  | 'approved'
  | 'published'
  | 'sent';

export type SectionStatus =
  | 'not_started'
  | 'in_progress'
  | 'completed'
  | 'needs_changes'
  | 'reviewed';

export type SectionType =
  | 'property_meta'
  | 'handover_meta'
  | 'admin_meta'
  | 'space_standard'
  | 'space_secondary'
  | 'space_technical'
  | 'closing_summary';

export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'boolean'
  | 'single_select'
  | 'multi_select'
  | 'photo_upload'
  | 'date'
  | 'email'
  | 'phone';

export type CommentType = 'internal_note' | 'revision_request' | 'final_observation';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export type KeyReturnSyncStatus = 'not_applicable' | 'pending' | 'synced' | 'failed';

export type PhotoUploadStatus = 'uploading' | 'uploaded' | 'failed';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  approval_status?: string;
  market: string | null;
  created_at: string;
  updated_at: string;
}

export interface InspectionSignature {
  id: string;
  inspection_id: string;
  signer_type: string;
  signer_name: string | null;
  signature_data: string | null;
  signature_status: 'signed' | 'refused' | 'unavailable';
  skip_reason: string | null;
  signed_at: string | null;
  created_by: string | null;
  created_at: string;
}

export type WorkflowStage = 'inspection' | 'review' | 'budget' | 'share';

export interface Inspection {
  id: string;
  source_event_id: string | null;
  template_id: string | null;
  hubspot_property_id: string | null;
  property_id: string;
  market: string;
  property_name: string | null;
  address: string | null;
  typology: string | null;
  property_type: string | null;
  inspection_type: string;
  inspector_id: string | null;
  executive_id: string | null;
  status: InspectionStatus;
  current_stage: WorkflowStage;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  approved_at: string | null;
  inspection_completed_at: string | null;
  review_completed_at: string | null;
  budget_completed_at: string | null;
  published_at: string | null;
  owner_url_generated_at: string | null;
  property_snapshot_json: Record<string, unknown>;
  property_overrides_json: Record<string, unknown> | null;
  generated_structure_json: Record<string, unknown> | null;
  fecha_devolucion_llave: string | null;
  fecha_devolucion_llave_sync_status: KeyReturnSyncStatus;
  last_active_section_id: string | null;
  last_active_at: string | null;
  created_by: string | null;
  submitted_by: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  inspector?: Profile;
  executive?: Profile;
}

export interface InspectionSection {
  id: string;
  inspection_id: string;
  template_section_id: string | null;
  section_key: string;
  section_title: string;
  section_type: string;
  sort_order: number;
  status: SectionStatus;
  is_visible: boolean;
  final_observation: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface InspectionFieldValue {
  id: string;
  inspection_id: string;
  inspection_section_id: string;
  field_key: string;
  field_label: string;
  field_type: string;
  group_key: string | null;
  value_text: string | null;
  value_json: unknown;
  sort_order: number;
  is_visible: boolean;
  updated_by: string | null;
  updated_at: string;
}

export interface InspectionPhoto {
  id: string;
  inspection_id: string;
  inspection_section_id: string;
  field_key: string | null;
  group_key: string | null;
  storage_bucket: string;
  storage_path: string;
  public_url: string | null;
  caption: string | null;
  sort_order: number;
  uploaded_by: string | null;
  created_at: string;
}

export interface InspectionReview {
  id: string;
  inspection_id: string;
  inspection_section_id: string;
  comment_type: CommentType;
  comment: string;
  created_by: string | null;
  created_at: string;
}

export interface PropertyPayload {
  hubspot_property_id?: string;
  property_id: string;
  market: string;
  property_name?: string;
  address?: string;
  typology?: string;
  property_type?: string;
  inspection_type: string;
  bedrooms_count?: number;
  bathrooms_count?: number;
  has_terrace_living?: boolean;
  has_terrace_bedroom?: boolean;
  has_walking_closet?: boolean;
  has_logia?: boolean;
  has_storage?: boolean;
  has_parking?: boolean;
  has_front_yard?: boolean;
  tower?: string;
  comuna?: string;
  recipient_email?: string;
  warranty_deposit?: number;
  scheduled_at?: string;
  fecha_recoleccion_llaves?: string;
  hora_recoleccion_llaves?: string;
  inspector?: { id: string; name: string; email: string };
  executive?: { id: string; name: string; email: string };
}

export interface RepairCatalogCategory {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface RepairCatalogItem {
  id: string;
  name: string;
  owner_friendly_name: string | null;
  category_id: string;
  description: string | null;
  unit: string;
  pricing_type: 'fixed' | 'per_unit' | 'per_m2';
  base_price: number;
  currency: string;
  market: string | null;
  is_active: boolean;
  internal_notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  category?: RepairCatalogCategory;
}

export interface InspectionRepairItem {
  id: string;
  inspection_id: string;
  inspection_section_id: string;
  repair_catalog_item_id: string | null;
  title_snapshot: string;
  owner_friendly_name_snapshot: string | null;
  description_snapshot: string | null;
  category_snapshot: string | null;
  unit: string;
  pricing_type: string;
  quantity: number;
  unit_price: number;
  subtotal: number; // generated column, read-only
  notes: string | null;
  visible_to_owner: boolean;
  sort_order: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface InspectionReportVersion {
  id: string;
  inspection_id: string;
  version_number: number;
  status: string;
  public_token: string | null;
  normalized_payload: Record<string, unknown>;
  is_latest: boolean;
  created_at: string;
  executive?: { id: string; name: string; email: string };
}
