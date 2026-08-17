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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          id: string
          new_values: Json | null
          old_values: Json | null
          target_id: string | null
          target_table: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          target_id?: string | null
          target_table: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          target_id?: string | null
          target_table?: string
        }
        Relationships: []
      }
      feature_requests: {
        Row: {
          created_at: string
          description: string | null
          id: string
          priority: string
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          priority?: string
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          priority?: string
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      market_intel: {
        Row: {
          asset_symbol: string
          created_at: string
          flow_type: string | null
          id: string
          intel_type: string | null
          is_premium: boolean
          liquidation_level: number | null
          value_usd: number | null
          wallet_label: string | null
          whale_flow_score: number | null
        }
        Insert: {
          asset_symbol: string
          created_at?: string
          flow_type?: string | null
          id?: string
          intel_type?: string | null
          is_premium?: boolean
          liquidation_level?: number | null
          value_usd?: number | null
          wallet_label?: string | null
          whale_flow_score?: number | null
        }
        Update: {
          asset_symbol?: string
          created_at?: string
          flow_type?: string | null
          id?: string
          intel_type?: string | null
          is_premium?: boolean
          liquidation_level?: number | null
          value_usd?: number | null
          wallet_label?: string | null
          whale_flow_score?: number | null
        }
        Relationships: []
      }
      payment_webhook_log: {
        Row: {
          caller_user_id: string | null
          created_at: string
          error_code: string | null
          error_message: string | null
          http_status: number | null
          id: string
          order_id: string | null
          payload: Json | null
          paypal_event: string | null
          request_id: string | null
          status: string
        }
        Insert: {
          caller_user_id?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          http_status?: number | null
          id?: string
          order_id?: string | null
          payload?: Json | null
          paypal_event?: string | null
          request_id?: string | null
          status: string
        }
        Update: {
          caller_user_id?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          http_status?: number | null
          id?: string
          order_id?: string | null
          payload?: Json | null
          paypal_event?: string | null
          request_id?: string | null
          status?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          subscribed_at: string | null
          subscription_period: string | null
          subscription_tier: Database["public"]["Enums"]["subscription_tier"]
          timezone: string | null
          trial_ends_at: string | null
          trial_started_at: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          subscribed_at?: string | null
          subscription_period?: string | null
          subscription_tier?: Database["public"]["Enums"]["subscription_tier"]
          timezone?: string | null
          trial_ends_at?: string | null
          trial_started_at?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          subscribed_at?: string | null
          subscription_period?: string | null
          subscription_tier?: Database["public"]["Enums"]["subscription_tier"]
          timezone?: string | null
          trial_ends_at?: string | null
          trial_started_at?: string | null
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      provider_status: {
        Row: {
          error_message: string | null
          last_error_at: string | null
          last_success_at: string | null
          latency_ms: number | null
          provider: string
        }
        Insert: {
          error_message?: string | null
          last_error_at?: string | null
          last_success_at?: string | null
          latency_ms?: number | null
          provider: string
        }
        Update: {
          error_message?: string | null
          last_error_at?: string | null
          last_success_at?: string | null
          latency_ms?: number | null
          provider?: string
        }
        Relationships: []
      }
      proxy_request_log: {
        Row: {
          created_at: string
          error: string | null
          id: string
          latency_ms: number | null
          path: string
          payload: Json | null
          req_id: string
          status: number | null
          upstream_snippet: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          latency_ms?: number | null
          path: string
          payload?: Json | null
          req_id: string
          status?: number | null
          upstream_snippet?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          latency_ms?: number | null
          path?: string
          payload?: Json | null
          req_id?: string
          status?: number | null
          upstream_snippet?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      sovereign_applications: {
        Row: {
          applicant_name: string
          aum_bracket: string
          contact_email: string
          created_at: string
          email_error: string | null
          email_message_id: string | null
          email_sent_at: string | null
          fund_name: string
          id: string
          message: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          applicant_name: string
          aum_bracket: string
          contact_email: string
          created_at?: string
          email_error?: string | null
          email_message_id?: string | null
          email_sent_at?: string | null
          fund_name: string
          id?: string
          message?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          applicant_name?: string
          aum_bracket?: string
          contact_email?: string
          created_at?: string
          email_error?: string | null
          email_message_id?: string | null
          email_sent_at?: string | null
          fund_name?: string
          id?: string
          message?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          id: string
          plan: string
          provider: string
          provider_subscription_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          plan: string
          provider: string
          provider_subscription_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          plan?: string
          provider?: string
          provider_subscription_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sync_jobs: {
        Row: {
          error_message: string | null
          job_name: string
          last_run_at: string | null
          rows_written: number | null
          status: string | null
        }
        Insert: {
          error_message?: string | null
          job_name: string
          last_run_at?: string | null
          rows_written?: number | null
          status?: string | null
        }
        Update: {
          error_message?: string | null
          job_name?: string
          last_run_at?: string | null
          rows_written?: number | null
          status?: string | null
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
      user_watchlist: {
        Row: {
          created_at: string
          id: string
          item_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_subscription_tier: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["subscription_tier"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      purge_old_proxy_logs: { Args: never; Returns: undefined }
      search_admin_audit_log: {
        Args: {
          p_action?: string
          p_actor?: string
          p_from?: string
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_to?: string
        }
        Returns: {
          action: string
          actor_name: string
          actor_user_id: string
          created_at: string
          id: string
          new_values: Json
          old_values: Json
          target_id: string
          target_table: string
          total_count: number
        }[]
      }
      test_user_roles_protection: {
        Args: never
        Returns: {
          detail: string
          passed: boolean
          test_name: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      subscription_tier: "free" | "pro" | "whale"
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
      subscription_tier: ["free", "pro", "whale"],
    },
  },
} as const
