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
      addons: {
        Row: {
          billing_period: string
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          monthly_quota: number | null
          name: string
          price_cents: number
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          billing_period?: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          monthly_quota?: number | null
          name: string
          price_cents?: number
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          billing_period?: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          monthly_quota?: number | null
          name?: string
          price_cents?: number
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      api_configs: {
        Row: {
          api_key_encrypted: string | null
          api_key_last4: string | null
          api_key_nonce: string | null
          created_at: string
          description: string | null
          display_name: string
          id: string
          is_active: boolean
          key_name: string
          priority: number
          provider: string | null
          updated_at: string
        }
        Insert: {
          api_key_encrypted?: string | null
          api_key_last4?: string | null
          api_key_nonce?: string | null
          created_at?: string
          description?: string | null
          display_name: string
          id?: string
          is_active?: boolean
          key_name: string
          priority?: number
          provider?: string | null
          updated_at?: string
        }
        Update: {
          api_key_encrypted?: string | null
          api_key_last4?: string | null
          api_key_nonce?: string | null
          created_at?: string
          description?: string | null
          display_name?: string
          id?: string
          is_active?: boolean
          key_name?: string
          priority?: number
          provider?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      api_error_logs: {
        Row: {
          context: Json | null
          created_at: string
          error_message: string | null
          error_status: string | null
          http_status: number | null
          id: string
          key_name: string
          source: string
        }
        Insert: {
          context?: Json | null
          created_at?: string
          error_message?: string | null
          error_status?: string | null
          http_status?: number | null
          id?: string
          key_name: string
          source?: string
        }
        Update: {
          context?: Json | null
          created_at?: string
          error_message?: string | null
          error_status?: string | null
          http_status?: number | null
          id?: string
          key_name?: string
          source?: string
        }
        Relationships: []
      }
      message_history: {
        Row: {
          created_at: string
          error: string | null
          evolution_response: Json | null
          id: string
          instance_name: string | null
          lead_id: string | null
          phone: string
          rendered_message: string
          status: string
          template_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          evolution_response?: Json | null
          id?: string
          instance_name?: string | null
          lead_id?: string | null
          phone: string
          rendered_message: string
          status?: string
          template_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          error?: string | null
          evolution_response?: Json | null
          id?: string
          instance_name?: string | null
          lead_id?: string | null
          phone?: string
          rendered_message?: string
          status?: string
          template_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      message_templates: {
        Row: {
          body: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          tags_used: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          tags_used?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          tags_used?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      payment_orders: {
        Row: {
          addon_slug: string | null
          amount: number
          created_at: string
          environment: string
          id: string
          order_kind: string
          package_id: string
          payment_id: string | null
          preference_id: string | null
          provider: string
          raw_response: Json | null
          searches_credited: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          addon_slug?: string | null
          amount?: number
          created_at?: string
          environment?: string
          id?: string
          order_kind?: string
          package_id: string
          payment_id?: string | null
          preference_id?: string | null
          provider?: string
          raw_response?: Json | null
          searches_credited?: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          addon_slug?: string | null
          amount?: number
          created_at?: string
          environment?: string
          id?: string
          order_kind?: string
          package_id?: string
          payment_id?: string | null
          preference_id?: string | null
          provider?: string
          raw_response?: Json | null
          searches_credited?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_suspended: boolean
          plan: string
          plan_searches_limit: number
          searches_used: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_suspended?: boolean
          plan?: string
          plan_searches_limit?: number
          searches_used?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_suspended?: boolean
          plan?: string
          plan_searches_limit?: number
          searches_used?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      search_packages: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          price: number
          searches_limit: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          price?: number
          searches_limit?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          searches_limit?: number
        }
        Relationships: []
      }
      search_results: {
        Row: {
          additional_data: Json | null
          address: string | null
          business_name: string
          business_type: string | null
          created_at: string
          email: string | null
          enriched_at: string | null
          enriched_data: Json | null
          enriched_source: string | null
          id: string
          latitude: number | null
          longitude: number | null
          owner_name: string | null
          phone: string | null
          rating: number | null
          reviews_count: number | null
          search_id: string
          social_media: Json | null
          source_api: string | null
          website: string | null
        }
        Insert: {
          additional_data?: Json | null
          address?: string | null
          business_name: string
          business_type?: string | null
          created_at?: string
          email?: string | null
          enriched_at?: string | null
          enriched_data?: Json | null
          enriched_source?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          owner_name?: string | null
          phone?: string | null
          rating?: number | null
          reviews_count?: number | null
          search_id: string
          social_media?: Json | null
          source_api?: string | null
          website?: string | null
        }
        Update: {
          additional_data?: Json | null
          address?: string | null
          business_name?: string
          business_type?: string | null
          created_at?: string
          email?: string | null
          enriched_at?: string | null
          enriched_data?: Json | null
          enriched_source?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          owner_name?: string | null
          phone?: string | null
          rating?: number | null
          reviews_count?: number | null
          search_id?: string
          social_media?: Json | null
          source_api?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "search_results_search_id_fkey"
            columns: ["search_id"]
            isOneToOne: false
            referencedRelation: "searches"
            referencedColumns: ["id"]
          },
        ]
      }
      searches: {
        Row: {
          category: string
          city: string
          created_at: string
          id: string
          neighborhood: string | null
          results_count: number | null
          search_query: string | null
          state: string
          status: string
          updated_at: string
          user_id: string
          warning: string | null
        }
        Insert: {
          category: string
          city: string
          created_at?: string
          id?: string
          neighborhood?: string | null
          results_count?: number | null
          search_query?: string | null
          state: string
          status?: string
          updated_at?: string
          user_id: string
          warning?: string | null
        }
        Update: {
          category?: string
          city?: string
          created_at?: string
          id?: string
          neighborhood?: string | null
          results_count?: number | null
          search_query?: string | null
          state?: string
          status?: string
          updated_at?: string
          user_id?: string
          warning?: string | null
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          description: string | null
          id: string
          setting_key: string
          setting_value: Json
          updated_at: string
        }
        Insert: {
          description?: string | null
          id?: string
          setting_key: string
          setting_value?: Json
          updated_at?: string
        }
        Update: {
          description?: string | null
          id?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string
        }
        Relationships: []
      }
      user_addons: {
        Row: {
          activated_at: string
          addon_slug: string
          created_at: string
          expires_at: string | null
          id: string
          monthly_quota: number | null
          monthly_used: number
          payment_order_id: string | null
          quota_reset_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          activated_at?: string
          addon_slug: string
          created_at?: string
          expires_at?: string | null
          id?: string
          monthly_quota?: number | null
          monthly_used?: number
          payment_order_id?: string | null
          quota_reset_at?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          activated_at?: string
          addon_slug?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          monthly_quota?: number | null
          monthly_used?: number
          payment_order_id?: string | null
          quota_reset_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_whatsapp_instances: {
        Row: {
          connected_at: string | null
          connection_state: string
          created_at: string
          id: string
          instance_name: string
          last_qr_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          connected_at?: string | null
          connection_state?: string
          created_at?: string
          id?: string
          instance_name: string
          last_qr_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          connected_at?: string | null
          connection_state?: string
          created_at?: string
          id?: string
          instance_name?: string
          last_qr_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_instances: {
        Row: {
          created_at: string
          id: string
          instance_name: string
          last_qr: string | null
          phone_number: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          instance_name: string
          last_qr?: string | null
          phone_number?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          instance_name?: string
          last_qr?: string | null
          phone_number?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_messages: {
        Row: {
          created_at: string
          error: string | null
          evolution_message_id: string | null
          id: string
          instance_id: string | null
          message: string
          result_id: string | null
          status: string
          to_number: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          evolution_message_id?: string | null
          id?: string
          instance_id?: string | null
          message: string
          result_id?: string | null
          status?: string
          to_number: string
          user_id: string
        }
        Update: {
          created_at?: string
          error?: string | null
          evolution_message_id?: string | null
          id?: string
          instance_id?: string | null
          message?: string
          result_id?: string | null
          status?: string
          to_number?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_result_id_fkey"
            columns: ["result_id"]
            isOneToOne: false
            referencedRelation: "search_results"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_api_key_decrypted: { Args: { _key_name: string }; Returns: string }
      get_provider_keys_decrypted: {
        Args: { _provider: string }
        Returns: {
          api_key: string
          id: string
          key_name: string
          priority: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      private_get_master_key_id: { Args: never; Returns: string }
      set_api_key: {
        Args: { _config_id: string; _plain_key: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
