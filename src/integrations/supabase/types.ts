export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      client_error_log: {
        Row: {
          app_version: string | null
          context: Json | null
          created_at: string
          error_kind: string
          event_kind: string | null
          id: string
          inspection_id: string | null
          message: string | null
          role: string | null
          route: string | null
          section_key: string | null
          status_code: number | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          app_version?: string | null
          context?: Json | null
          created_at?: string
          error_kind: string
          event_kind?: string | null
          id?: string
          inspection_id?: string | null
          message?: string | null
          role?: string | null
          route?: string | null
          section_key?: string | null
          status_code?: number | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          app_version?: string | null
          context?: Json | null
          created_at?: string
          error_kind?: string
          event_kind?: string | null
          id?: string
          inspection_id?: string | null
          message?: string | null
          role?: string | null
          route?: string | null
          section_key?: string | null
          status_code?: number | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      communication_deliveries: {
        Row: {
          channel: string
          created_at: string
          error_message: string | null
          event_name: string
          id: string
          inspection_id: string | null
          provider_key: string
          provider_message_id: string | null
          recipient_type: string
          recipient_value: string | null
          request_payload_json: Json | null
          response_payload_json: Json | null
          rule_id: string | null
          sent_at: string | null
          status: string
          template_key: string | null
        }
        Insert: {
          channel: string
          created_at?: string
          error_message?: string | null
          event_name: string
          id?: string
          inspection_id?: string | null
          provider_key: string
          provider_message_id?: string | null
          recipient_type: string
          recipient_value?: string | null
          request_payload_json?: Json | null
          response_payload_json?: Json | null
          rule_id?: string | null
          sent_at?: string | null
          status: string
          template_key?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          error_message?: string | null
          event_name?: string
          id?: string
          inspection_id?: string | null
          provider_key?: string
          provider_message_id?: string | null
          recipient_type?: string
          recipient_value?: string | null
          request_payload_json?: Json | null
          response_payload_json?: Json | null
          rule_id?: string | null
          sent_at?: string | null
          status?: string
          template_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "communication_deliveries_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_deliveries_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "communication_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_rules: {
        Row: {
          channel: string
          conditions_json: Json | null
          created_at: string
          event_name: string
          id: string
          is_active: boolean
          market: string | null
          name: string
          provider_key: string
          recipient_type: string
          template_key: string
          updated_at: string
        }
        Insert: {
          channel: string
          conditions_json?: Json | null
          created_at?: string
          event_name: string
          id?: string
          is_active?: boolean
          market?: string | null
          name: string
          provider_key: string
          recipient_type: string
          template_key: string
          updated_at?: string
        }
        Update: {
          channel?: string
          conditions_json?: Json | null
          created_at?: string
          event_name?: string
          id?: string
          is_active?: boolean
          market?: string | null
          name?: string
          provider_key?: string
          recipient_type?: string
          template_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      communication_templates: {
        Row: {
          channel: string
          created_at: string
          external_template_name: string | null
          id: string
          is_active: boolean
          language: string | null
          market: string | null
          name: string
          preview_text: string | null
          provider_key: string
          template_key: string
          updated_at: string
          variables_json: Json | null
        }
        Insert: {
          channel: string
          created_at?: string
          external_template_name?: string | null
          id?: string
          is_active?: boolean
          language?: string | null
          market?: string | null
          name: string
          preview_text?: string | null
          provider_key: string
          template_key: string
          updated_at?: string
          variables_json?: Json | null
        }
        Update: {
          channel?: string
          created_at?: string
          external_template_name?: string | null
          id?: string
          is_active?: boolean
          language?: string | null
          market?: string | null
          name?: string
          preview_text?: string | null
          provider_key?: string
          template_key?: string
          updated_at?: string
          variables_json?: Json | null
        }
        Relationships: []
      }
      contractors: {
        Row: {
          country: string
          created_at: string
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          country?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          country?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      hubspot_sync_log: {
        Row: {
          action: string
          created_at: string
          error_message: string | null
          event_time: string | null
          external_reference_id: string | null
          hubspot_object_id: string | null
          hubspot_object_type_id: string | null
          id: string
          inspection_id: string | null
          request_payload: Json | null
          response_body: Json | null
          response_status: number | null
          retried_from_log_id: string | null
          retried_to_log_id: string | null
          retry_attempts_json: Json
          retry_count: number
          status: string
          triggered_by: string | null
        }
        Insert: {
          action: string
          created_at?: string
          error_message?: string | null
          event_time?: string | null
          external_reference_id?: string | null
          hubspot_object_id?: string | null
          hubspot_object_type_id?: string | null
          id?: string
          inspection_id?: string | null
          request_payload?: Json | null
          response_body?: Json | null
          response_status?: number | null
          retried_from_log_id?: string | null
          retried_to_log_id?: string | null
          retry_attempts_json?: Json
          retry_count?: number
          status: string
          triggered_by?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          error_message?: string | null
          event_time?: string | null
          external_reference_id?: string | null
          hubspot_object_id?: string | null
          hubspot_object_type_id?: string | null
          id?: string
          inspection_id?: string | null
          request_payload?: Json | null
          response_body?: Json | null
          response_status?: number | null
          retried_from_log_id?: string | null
          retried_to_log_id?: string | null
          retry_attempts_json?: Json
          retry_count?: number
          status?: string
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hubspot_sync_log_external_reference_id_fkey"
            columns: ["external_reference_id"]
            isOneToOne: false
            referencedRelation: "inspection_external_references"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hubspot_sync_log_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_audit_log: {
        Row: {
          action: string
          created_at: string
          id: string
          inspection_id: string
          new_status: string | null
          note: string | null
          performed_by: string | null
          previous_status: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          inspection_id: string
          new_status?: string | null
          note?: string | null
          performed_by?: string | null
          previous_status?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          inspection_id?: string
          new_status?: string | null
          note?: string | null
          performed_by?: string | null
          previous_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inspection_audit_log_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_audit_log_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_external_references: {
        Row: {
          created_at: string
          external_object_id: string
          external_object_type: string
          external_object_type_id: string | null
          id: string
          inspection_id: string
          is_active: boolean
          metadata: Json | null
          provider: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          external_object_id: string
          external_object_type: string
          external_object_type_id?: string | null
          id?: string
          inspection_id: string
          is_active?: boolean
          metadata?: Json | null
          provider: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          external_object_id?: string
          external_object_type?: string
          external_object_type_id?: string | null
          id?: string
          inspection_id?: string
          is_active?: boolean
          metadata?: Json | null
          provider?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspection_external_references_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_field_values: {
        Row: {
          field_key: string
          field_label: string
          field_type: string
          group_key: string | null
          id: string
          inspection_id: string
          inspection_section_id: string
          is_visible: boolean
          sort_order: number
          updated_at: string
          updated_by: string | null
          value_json: Json | null
          value_text: string | null
        }
        Insert: {
          field_key: string
          field_label: string
          field_type: string
          group_key?: string | null
          id?: string
          inspection_id: string
          inspection_section_id: string
          is_visible?: boolean
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
          value_json?: Json | null
          value_text?: string | null
        }
        Update: {
          field_key?: string
          field_label?: string
          field_type?: string
          group_key?: string | null
          id?: string
          inspection_id?: string
          inspection_section_id?: string
          is_visible?: boolean
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
          value_json?: Json | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inspection_field_values_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_field_values_inspection_section_id_fkey"
            columns: ["inspection_section_id"]
            isOneToOne: false
            referencedRelation: "inspection_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_field_values_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_owner_feedback: {
        Row: {
          comment: string | null
          decision: string
          id: string
          inspection_id: string
          repair_item_id: string
          report_version_id: string
          submitted_at: string
          submitter_name: string | null
        }
        Insert: {
          comment?: string | null
          decision: string
          id?: string
          inspection_id: string
          repair_item_id: string
          report_version_id: string
          submitted_at?: string
          submitter_name?: string | null
        }
        Update: {
          comment?: string | null
          decision?: string
          id?: string
          inspection_id?: string
          repair_item_id?: string
          report_version_id?: string
          submitted_at?: string
          submitter_name?: string | null
        }
        Relationships: []
      }
      inspection_owner_feedback_submissions: {
        Row: {
          all_accepted: boolean
          id: string
          inspection_id: string
          report_version_id: string
          submitted_at: string
          submitter_name: string | null
          summary_json: Json
        }
        Insert: {
          all_accepted: boolean
          id?: string
          inspection_id: string
          report_version_id: string
          submitted_at?: string
          submitter_name?: string | null
          summary_json: Json
        }
        Update: {
          all_accepted?: boolean
          id?: string
          inspection_id?: string
          report_version_id?: string
          submitted_at?: string
          submitter_name?: string | null
          summary_json?: Json
        }
        Relationships: []
      }
      inspection_photos: {
        Row: {
          caption: string | null
          created_at: string
          field_key: string | null
          group_key: string | null
          id: string
          inspection_id: string
          inspection_section_id: string
          public_url: string | null
          sort_order: number
          storage_bucket: string
          storage_path: string
          uploaded_by: string | null
          visible_to_owner: boolean
        }
        Insert: {
          caption?: string | null
          created_at?: string
          field_key?: string | null
          group_key?: string | null
          id?: string
          inspection_id: string
          inspection_section_id: string
          public_url?: string | null
          sort_order?: number
          storage_bucket?: string
          storage_path: string
          uploaded_by?: string | null
          visible_to_owner?: boolean
        }
        Update: {
          caption?: string | null
          created_at?: string
          field_key?: string | null
          group_key?: string | null
          id?: string
          inspection_id?: string
          inspection_section_id?: string
          public_url?: string | null
          sort_order?: number
          storage_bucket?: string
          storage_path?: string
          uploaded_by?: string | null
          visible_to_owner?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "inspection_photos_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_photos_inspection_section_id_fkey"
            columns: ["inspection_section_id"]
            isOneToOne: false
            referencedRelation: "inspection_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_photos_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_quotation_discounts: {
        Row: {
          applied_at: string
          applied_by: string | null
          created_at: string
          discount_reason: string | null
          discount_type: string
          discount_value: number
          id: string
          inspection_id: string
          is_active: boolean
          removed_at: string | null
          removed_by: string | null
          superseded_by_id: string | null
          updated_at: string
        }
        Insert: {
          applied_at?: string
          applied_by?: string | null
          created_at?: string
          discount_reason?: string | null
          discount_type: string
          discount_value: number
          id?: string
          inspection_id: string
          is_active?: boolean
          removed_at?: string | null
          removed_by?: string | null
          superseded_by_id?: string | null
          updated_at?: string
        }
        Update: {
          applied_at?: string
          applied_by?: string | null
          created_at?: string
          discount_reason?: string | null
          discount_type?: string
          discount_value?: number
          id?: string
          inspection_id?: string
          is_active?: boolean
          removed_at?: string | null
          removed_by?: string | null
          superseded_by_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspection_quotation_discounts_superseded_by_id_fkey"
            columns: ["superseded_by_id"]
            isOneToOne: false
            referencedRelation: "inspection_quotation_discounts"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_repair_items: {
        Row: {
          category_snapshot: string | null
          contractor_unit_price: number
          created_at: string
          created_by: string | null
          description_snapshot: string | null
          id: string
          inspection_id: string
          inspection_section_id: string
          notes: string | null
          owner_friendly_name_snapshot: string | null
          payer_role: string
          payment_nature: string
          pricing_type: string
          quantity: number
          repair_catalog_item_id: string | null
          sort_order: number
          subtotal: number | null
          title_snapshot: string
          unit: string
          unit_price: number
          updated_at: string
          updated_by: string | null
          visible_to_owner: boolean
        }
        Insert: {
          category_snapshot?: string | null
          contractor_unit_price?: number
          created_at?: string
          created_by?: string | null
          description_snapshot?: string | null
          id?: string
          inspection_id: string
          inspection_section_id: string
          notes?: string | null
          owner_friendly_name_snapshot?: string | null
          payer_role?: string
          payment_nature?: string
          pricing_type?: string
          quantity?: number
          repair_catalog_item_id?: string | null
          sort_order?: number
          subtotal?: number | null
          title_snapshot: string
          unit?: string
          unit_price?: number
          updated_at?: string
          updated_by?: string | null
          visible_to_owner?: boolean
        }
        Update: {
          category_snapshot?: string | null
          contractor_unit_price?: number
          created_at?: string
          created_by?: string | null
          description_snapshot?: string | null
          id?: string
          inspection_id?: string
          inspection_section_id?: string
          notes?: string | null
          owner_friendly_name_snapshot?: string | null
          payer_role?: string
          payment_nature?: string
          pricing_type?: string
          quantity?: number
          repair_catalog_item_id?: string | null
          sort_order?: number
          subtotal?: number | null
          title_snapshot?: string
          unit?: string
          unit_price?: number
          updated_at?: string
          updated_by?: string | null
          visible_to_owner?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "inspection_repair_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_repair_items_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_repair_items_inspection_section_id_fkey"
            columns: ["inspection_section_id"]
            isOneToOne: false
            referencedRelation: "inspection_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_repair_items_repair_catalog_item_id_fkey"
            columns: ["repair_catalog_item_id"]
            isOneToOne: false
            referencedRelation: "repair_catalog_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_repair_items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_report_versions: {
        Row: {
          audience: string
          created_at: string
          id: string
          inspection_id: string
          is_latest: boolean
          normalized_payload: Json
          owner_decision_summary_json: Json | null
          public_token: string | null
          published_by: string | null
          status: string
          version_number: number
        }
        Insert: {
          audience?: string
          created_at?: string
          id?: string
          inspection_id: string
          is_latest?: boolean
          normalized_payload: Json
          owner_decision_summary_json?: Json | null
          public_token?: string | null
          published_by?: string | null
          status: string
          version_number: number
        }
        Update: {
          audience?: string
          created_at?: string
          id?: string
          inspection_id?: string
          is_latest?: boolean
          normalized_payload?: Json
          owner_decision_summary_json?: Json | null
          public_token?: string | null
          published_by?: string | null
          status?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "inspection_report_versions_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_report_versions_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_reviews: {
        Row: {
          comment: string
          comment_type: string
          created_at: string
          created_by: string | null
          id: string
          inspection_id: string
          inspection_section_id: string
        }
        Insert: {
          comment: string
          comment_type: string
          created_at?: string
          created_by?: string | null
          id?: string
          inspection_id: string
          inspection_section_id: string
        }
        Update: {
          comment?: string
          comment_type?: string
          created_at?: string
          created_by?: string | null
          id?: string
          inspection_id?: string
          inspection_section_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspection_reviews_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_reviews_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_reviews_inspection_section_id_fkey"
            columns: ["inspection_section_id"]
            isOneToOne: false
            referencedRelation: "inspection_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_sections: {
        Row: {
          created_at: string
          final_observation: string | null
          id: string
          inspection_id: string
          is_visible: boolean
          reviewed_at: string | null
          reviewed_by: string | null
          section_key: string
          section_title: string
          section_type: string
          sort_order: number
          status: string
          template_section_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          final_observation?: string | null
          id?: string
          inspection_id: string
          is_visible?: boolean
          reviewed_at?: string | null
          reviewed_by?: string | null
          section_key: string
          section_title: string
          section_type: string
          sort_order: number
          status?: string
          template_section_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          final_observation?: string | null
          id?: string
          inspection_id?: string
          is_visible?: boolean
          reviewed_at?: string | null
          reviewed_by?: string | null
          section_key?: string
          section_title?: string
          section_type?: string
          sort_order?: number
          status?: string
          template_section_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspection_sections_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_sections_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspection_sections_template_section_id_fkey"
            columns: ["template_section_id"]
            isOneToOne: false
            referencedRelation: "inspection_template_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_signatures: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          inspection_id: string
          signature_data: string | null
          signature_status: string
          signed_at: string | null
          signer_name: string | null
          signer_type: string
          skip_reason: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          inspection_id: string
          signature_data?: string | null
          signature_status?: string
          signed_at?: string | null
          signer_name?: string | null
          signer_type?: string
          skip_reason?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          inspection_id?: string
          signature_data?: string | null
          signature_status?: string
          signed_at?: string | null
          signer_name?: string | null
          signer_type?: string
          skip_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspection_signatures_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: true
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_source_events: {
        Row: {
          duplicate_attempts_json: Json
          duplicate_count: number
          error_message: string | null
          event_type: string | null
          external_event_id: string | null
          external_object_id: string | null
          failure_reason: string | null
          hubspot_event_id: string | null
          hubspot_property_id: string | null
          id: string
          inspection_id: string | null
          normalized_payload_json: Json | null
          payload_json: Json
          payload_version: string | null
          processed_at: string | null
          processing_duration_ms: number | null
          processing_started_at: string | null
          processing_status: string
          processing_step: string | null
          received_at: string
          recovery_count: number
          retry_attempts_json: Json
          retry_count: number
          source: string
        }
        Insert: {
          duplicate_attempts_json?: Json
          duplicate_count?: number
          error_message?: string | null
          event_type?: string | null
          external_event_id?: string | null
          external_object_id?: string | null
          failure_reason?: string | null
          hubspot_event_id?: string | null
          hubspot_property_id?: string | null
          id?: string
          inspection_id?: string | null
          normalized_payload_json?: Json | null
          payload_json: Json
          payload_version?: string | null
          processed_at?: string | null
          processing_duration_ms?: number | null
          processing_started_at?: string | null
          processing_status?: string
          processing_step?: string | null
          received_at?: string
          recovery_count?: number
          retry_attempts_json?: Json
          retry_count?: number
          source?: string
        }
        Update: {
          duplicate_attempts_json?: Json
          duplicate_count?: number
          error_message?: string | null
          event_type?: string | null
          external_event_id?: string | null
          external_object_id?: string | null
          failure_reason?: string | null
          hubspot_event_id?: string | null
          hubspot_property_id?: string | null
          id?: string
          inspection_id?: string | null
          normalized_payload_json?: Json | null
          payload_json?: Json
          payload_version?: string | null
          processed_at?: string | null
          processing_duration_ms?: number | null
          processing_started_at?: string | null
          processing_status?: string
          processing_step?: string | null
          received_at?: string
          recovery_count?: number
          retry_attempts_json?: Json
          retry_count?: number
          source?: string
        }
        Relationships: []
      }
      inspection_template_fields: {
        Row: {
          created_at: string
          default_value: string | null
          field_key: string
          field_label: string
          field_type: string
          group_key: string | null
          help_text: string | null
          id: string
          options_json: Json | null
          required: boolean
          sort_order: number
          template_section_id: string
        }
        Insert: {
          created_at?: string
          default_value?: string | null
          field_key: string
          field_label: string
          field_type: string
          group_key?: string | null
          help_text?: string | null
          id?: string
          options_json?: Json | null
          required?: boolean
          sort_order: number
          template_section_id: string
        }
        Update: {
          created_at?: string
          default_value?: string | null
          field_key?: string
          field_label?: string
          field_type?: string
          group_key?: string | null
          help_text?: string | null
          id?: string
          options_json?: Json | null
          required?: boolean
          sort_order?: number
          template_section_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspection_template_fields_template_section_id_fkey"
            columns: ["template_section_id"]
            isOneToOne: false
            referencedRelation: "inspection_template_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_template_sections: {
        Row: {
          created_at: string
          id: string
          is_repeatable: boolean
          section_key: string
          section_title: string
          section_type: string
          sort_order: number
          template_id: string
          visibility_rules: Json | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_repeatable?: boolean
          section_key: string
          section_title: string
          section_type: string
          sort_order: number
          template_id: string
          visibility_rules?: Json | null
        }
        Update: {
          created_at?: string
          id?: string
          is_repeatable?: boolean
          section_key?: string
          section_title?: string
          section_type?: string
          sort_order?: number
          template_id?: string
          visibility_rules?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "inspection_template_sections_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "inspection_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_templates: {
        Row: {
          created_at: string
          id: string
          inspection_type: string
          is_active: boolean
          market: string
          name: string
          property_type: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          inspection_type: string
          is_active?: boolean
          market: string
          name: string
          property_type?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          inspection_type?: string
          is_active?: boolean
          market?: string
          name?: string
          property_type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      inspections: {
        Row: {
          address: string | null
          approved_at: string | null
          approved_by: string | null
          budget_completed_at: string | null
          completed_at: string | null
          contractor_id: string | null
          created_at: string
          created_by: string | null
          current_stage: string
          executive_id: string | null
          fecha_devolucion_llave: string | null
          fecha_devolucion_llave_sync_status: string
          generated_structure_json: Json | null
          hubspot_property_id: string | null
          id: string
          inspection_completed_at: string | null
          inspection_type: string
          inspector_id: string | null
          last_active_at: string | null
          last_active_section_id: string | null
          market: string
          owner_feedback_last_submitted_at: string | null
          owner_feedback_status: string
          owner_url_generated_at: string | null
          property_id: string
          property_name: string | null
          property_overrides_json: Json | null
          property_snapshot_json: Json
          property_type: string | null
          published_at: string | null
          quien_repara: string | null
          review_completed_at: string | null
          scheduled_at: string | null
          source_event_id: string | null
          started_at: string | null
          status: string
          submitted_by: string | null
          template_id: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          approved_at?: string | null
          approved_by?: string | null
          budget_completed_at?: string | null
          completed_at?: string | null
          contractor_id?: string | null
          created_at?: string
          created_by?: string | null
          current_stage?: string
          executive_id?: string | null
          fecha_devolucion_llave?: string | null
          fecha_devolucion_llave_sync_status?: string
          generated_structure_json?: Json | null
          hubspot_property_id?: string | null
          id?: string
          inspection_completed_at?: string | null
          inspection_type: string
          inspector_id?: string | null
          last_active_at?: string | null
          last_active_section_id?: string | null
          market: string
          owner_feedback_last_submitted_at?: string | null
          owner_feedback_status?: string
          owner_url_generated_at?: string | null
          property_id: string
          property_name?: string | null
          property_overrides_json?: Json | null
          property_snapshot_json: Json
          property_type?: string | null
          published_at?: string | null
          quien_repara?: string | null
          review_completed_at?: string | null
          scheduled_at?: string | null
          source_event_id?: string | null
          started_at?: string | null
          status?: string
          submitted_by?: string | null
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          approved_at?: string | null
          approved_by?: string | null
          budget_completed_at?: string | null
          completed_at?: string | null
          contractor_id?: string | null
          created_at?: string
          created_by?: string | null
          current_stage?: string
          executive_id?: string | null
          fecha_devolucion_llave?: string | null
          fecha_devolucion_llave_sync_status?: string
          generated_structure_json?: Json | null
          hubspot_property_id?: string | null
          id?: string
          inspection_completed_at?: string | null
          inspection_type?: string
          inspector_id?: string | null
          last_active_at?: string | null
          last_active_section_id?: string | null
          market?: string
          owner_feedback_last_submitted_at?: string | null
          owner_feedback_status?: string
          owner_url_generated_at?: string | null
          property_id?: string
          property_name?: string | null
          property_overrides_json?: Json | null
          property_snapshot_json?: Json
          property_type?: string | null
          published_at?: string | null
          quien_repara?: string | null
          review_completed_at?: string | null
          scheduled_at?: string | null
          source_event_id?: string | null
          started_at?: string | null
          status?: string
          submitted_by?: string | null
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_last_active_section"
            columns: ["last_active_section_id"]
            isOneToOne: false
            referencedRelation: "inspection_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_executive_id_fkey"
            columns: ["executive_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_inspector_id_fkey"
            columns: ["inspector_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "inspection_source_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "inspection_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      market_tax_settings: {
        Row: {
          currency: string
          market: string
          updated_at: string
          updated_by: string | null
          vat_enabled: boolean
          vat_label: string
          vat_percentage: number
        }
        Insert: {
          currency?: string
          market: string
          updated_at?: string
          updated_by?: string | null
          vat_enabled?: boolean
          vat_label?: string
          vat_percentage?: number
        }
        Update: {
          currency?: string
          market?: string
          updated_at?: string
          updated_by?: string | null
          vat_enabled?: boolean
          vat_label?: string
          vat_percentage?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          approval_status: string
          country_code: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          market: string | null
          phone: string | null
          role: string
          updated_at: string
        }
        Insert: {
          approval_status?: string
          country_code?: string | null
          created_at?: string
          email: string
          full_name: string
          id: string
          is_active?: boolean
          market?: string | null
          phone?: string | null
          role: string
          updated_at?: string
        }
        Update: {
          approval_status?: string
          country_code?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          market?: string | null
          phone?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      repair_catalog_categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      repair_catalog_item_contractor_prices: {
        Row: {
          contractor_id: string
          created_at: string
          currency: string
          id: string
          price: number
          repair_catalog_item_id: string
          updated_at: string
        }
        Insert: {
          contractor_id: string
          created_at?: string
          currency?: string
          id?: string
          price?: number
          repair_catalog_item_id: string
          updated_at?: string
        }
        Update: {
          contractor_id?: string
          created_at?: string
          currency?: string
          id?: string
          price?: number
          repair_catalog_item_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "repair_catalog_item_contractor_pric_repair_catalog_item_id_fkey"
            columns: ["repair_catalog_item_id"]
            isOneToOne: false
            referencedRelation: "repair_catalog_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_catalog_item_contractor_prices_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
        ]
      }
      repair_catalog_items: {
        Row: {
          base_price: number
          category_id: string
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          id: string
          internal_notes: string | null
          is_active: boolean
          market: string | null
          name: string
          owner_friendly_name: string | null
          pricing_type: string
          unit: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          base_price?: number
          category_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          internal_notes?: string | null
          is_active?: boolean
          market?: string | null
          name: string
          owner_friendly_name?: string | null
          pricing_type?: string
          unit?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          base_price?: number
          category_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          internal_notes?: string | null
          is_active?: boolean
          market?: string | null
          name?: string
          owner_friendly_name?: string | null
          pricing_type?: string
          unit?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "repair_catalog_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "repair_catalog_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_catalog_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_catalog_items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      slack_notifications_log: {
        Row: {
          error_message: string | null
          event_type: string
          id: string
          inspection_id: string
          recipient_email: string | null
          recipient_slack_user_id: string | null
          sent_at: string
          slack_channel: string | null
          slack_message_ts: string | null
          status: string
        }
        Insert: {
          error_message?: string | null
          event_type: string
          id?: string
          inspection_id: string
          recipient_email?: string | null
          recipient_slack_user_id?: string | null
          sent_at?: string
          slack_channel?: string | null
          slack_message_ts?: string | null
          status?: string
        }
        Update: {
          error_message?: string | null
          event_type?: string
          id?: string
          inspection_id?: string
          recipient_email?: string | null
          recipient_slack_user_id?: string | null
          sent_at?: string
          slack_channel?: string | null
          slack_message_ts?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "slack_notifications_log_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
        ]
      }
      system_health_state: {
        Row: {
          detail: string | null
          id: string
          last_checked_at: string
          last_notified_at: string | null
          since: string
          status: string
        }
        Insert: {
          detail?: string | null
          id?: string
          last_checked_at?: string
          last_notified_at?: string | null
          since?: string
          status?: string
        }
        Update: {
          detail?: string | null
          id?: string
          last_checked_at?: string
          last_notified_at?: string | null
          since?: string
          status?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_inspection_from_event: {
        Args: { p_event_id: string }
        Returns: {
          error_detail: string
          failure_reason: string
          inspection_id: string
        }[]
      }
      executive_force_close_owner_feedback: {
        Args: { p_inspection_id: string; p_note?: string; p_reason: string }
        Returns: Json
      }
      finalize_inspection: {
        Args: { p_inspection_id: string; p_note?: string }
        Returns: Json
      }
      get_executive_performance: {
        Args: never
        Returns: {
          assigned: number
          client_amount: number
          contractor_cost: number
          executive_id: string
          executive_name: string
          inspections_with_items: number
          inspections_with_versions: number
          items_per_inspection: number
          margin_pct: number
          median_days_owner_response: number
          median_hours_to_publish: number
          median_hours_to_review: number
          owner_accepted: number
          owner_no_response: number
          owner_responded: number
          published: number
          repair_items: number
          report_versions: number
          versions_per_report: number
        }[]
      }
      get_inspector_performance: {
        Args: never
        Returns: {
          assigned: number
          avg_active_minutes: number
          completed: number
          fields_filled: number
          in_progress: number
          inspector_id: string
          inspector_name: string
          last_activity_at: string
          median_active_minutes: number
          median_hours_to_submit: number
          photos: number
          photos_per_inspection: number
        }[]
      }
      get_published_report: {
        Args: { p_property_id: string; p_token: string }
        Returns: Json
      }
      get_user_role: { Args: { _user_id: string }; Returns: string }
      has_role: { Args: { _role: string; _user_id: string }; Returns: boolean }
      is_comercial: { Args: never; Returns: boolean }
      is_visible_checkout_for_comercial: {
        Args: { _inspection_id: string }
        Returns: boolean
      }
      submit_owner_feedback: {
        Args: {
          p_decisions: Json
          p_property_id: string
          p_submitter_name: string
          p_token: string
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
