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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      external_user_mappings: {
        Row: {
          created_at: string
          hubspot_email: string | null
          hubspot_user_id: string | null
          id: string
          is_active: boolean
          profile_id: string | null
          provider: string
          role_hint: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          hubspot_email?: string | null
          hubspot_user_id?: string | null
          id?: string
          is_active?: boolean
          profile_id?: string | null
          provider?: string
          role_hint?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          hubspot_email?: string | null
          hubspot_user_id?: string | null
          id?: string
          is_active?: boolean
          profile_id?: string | null
          provider?: string
          role_hint?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_user_mappings_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      inspection_repair_items: {
        Row: {
          category_snapshot: string | null
          created_at: string
          created_by: string | null
          description_snapshot: string | null
          id: string
          inspection_id: string
          inspection_section_id: string
          notes: string | null
          owner_friendly_name_snapshot: string | null
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
          created_at?: string
          created_by?: string | null
          description_snapshot?: string | null
          id?: string
          inspection_id: string
          inspection_section_id: string
          notes?: string | null
          owner_friendly_name_snapshot?: string | null
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
          created_at?: string
          created_by?: string | null
          description_snapshot?: string | null
          id?: string
          inspection_id?: string
          inspection_section_id?: string
          notes?: string | null
          owner_friendly_name_snapshot?: string | null
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
          created_at: string
          id: string
          inspection_id: string
          is_latest: boolean
          normalized_payload: Json
          public_token: string | null
          status: string
          version_number: number
        }
        Insert: {
          created_at?: string
          id?: string
          inspection_id: string
          is_latest?: boolean
          normalized_payload: Json
          public_token?: string | null
          status: string
          version_number: number
        }
        Update: {
          created_at?: string
          id?: string
          inspection_id?: string
          is_latest?: boolean
          normalized_payload?: Json
          public_token?: string | null
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
      inspection_source_events: {
        Row: {
          error_message: string | null
          hubspot_event_id: string | null
          hubspot_property_id: string | null
          id: string
          payload_json: Json
          processed_at: string | null
          processing_status: string
          received_at: string
          source: string
        }
        Insert: {
          error_message?: string | null
          hubspot_event_id?: string | null
          hubspot_property_id?: string | null
          id?: string
          payload_json: Json
          processed_at?: string | null
          processing_status?: string
          received_at?: string
          source?: string
        }
        Update: {
          error_message?: string | null
          hubspot_event_id?: string | null
          hubspot_property_id?: string | null
          id?: string
          payload_json?: Json
          processed_at?: string | null
          processing_status?: string
          received_at?: string
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
          typology: string | null
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
          typology?: string | null
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
          typology?: string | null
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
          created_at: string
          created_by: string | null
          current_stage: string
          executive_id: string | null
          generated_structure_json: Json | null
          hubspot_property_id: string | null
          id: string
          inspection_completed_at: string | null
          inspection_type: string
          inspector_id: string | null
          last_active_at: string | null
          last_active_section_id: string | null
          market: string
          owner_url_generated_at: string | null
          property_id: string
          property_name: string | null
          property_snapshot_json: Json
          property_type: string | null
          published_at: string | null
          review_completed_at: string | null
          scheduled_at: string | null
          source_event_id: string | null
          started_at: string | null
          status: string
          submitted_by: string | null
          template_id: string | null
          typology: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          approved_at?: string | null
          approved_by?: string | null
          budget_completed_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          current_stage?: string
          executive_id?: string | null
          generated_structure_json?: Json | null
          hubspot_property_id?: string | null
          id?: string
          inspection_completed_at?: string | null
          inspection_type: string
          inspector_id?: string | null
          last_active_at?: string | null
          last_active_section_id?: string | null
          market: string
          owner_url_generated_at?: string | null
          property_id: string
          property_name?: string | null
          property_snapshot_json: Json
          property_type?: string | null
          published_at?: string | null
          review_completed_at?: string | null
          scheduled_at?: string | null
          source_event_id?: string | null
          started_at?: string | null
          status?: string
          submitted_by?: string | null
          template_id?: string | null
          typology?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          approved_at?: string | null
          approved_by?: string | null
          budget_completed_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          current_stage?: string
          executive_id?: string | null
          generated_structure_json?: Json | null
          hubspot_property_id?: string | null
          id?: string
          inspection_completed_at?: string | null
          inspection_type?: string
          inspector_id?: string | null
          last_active_at?: string | null
          last_active_section_id?: string | null
          market?: string
          owner_url_generated_at?: string | null
          property_id?: string
          property_name?: string | null
          property_snapshot_json?: Json
          property_type?: string | null
          published_at?: string | null
          review_completed_at?: string | null
          scheduled_at?: string | null
          source_event_id?: string | null
          started_at?: string | null
          status?: string
          submitted_by?: string | null
          template_id?: string | null
          typology?: string | null
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
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          market: string | null
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id: string
          is_active?: boolean
          market?: string | null
          role: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          market?: string | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_published_report: {
        Args: { p_property_id: string; p_token: string }
        Returns: Json
      }
      get_user_role: { Args: { _user_id: string }; Returns: string }
      has_role: { Args: { _role: string; _user_id: string }; Returns: boolean }
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
