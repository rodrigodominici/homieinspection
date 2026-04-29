export interface CommunicationRule {
  id: string;
  name: string;
  event_name: string;
  is_active: boolean;
  channel: string;
  provider_key: string;
  template_key: string;
  recipient_type: string;
  market: string | null;
  conditions_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface CommunicationTemplate {
  id: string;
  template_key: string;
  name: string;
  channel: string;
  provider_key: string;
  market: string | null;
  language: string | null;
  external_template_name: string | null;
  variables_json: string[] | null;
  preview_text: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CommunicationDelivery {
  id: string;
  event_name: string;
  inspection_id: string | null;
  rule_id: string | null;
  channel: string;
  provider_key: string;
  recipient_type: string;
  recipient_value: string | null;
  template_key: string | null;
  request_payload_json: Record<string, unknown> | null;
  response_payload_json: Record<string, unknown> | null;
  status: 'pending' | 'sent' | 'error' | 'skipped';
  error_message: string | null;
  provider_message_id: string | null;
  created_at: string;
  sent_at: string | null;
}
