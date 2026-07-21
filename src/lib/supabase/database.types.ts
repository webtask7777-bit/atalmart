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
      addresses: {
        Row: {
          address_line: string
          created_at: string
          id: string
          label: string
          lat: number
          lng: number
          user_id: string
        }
        Insert: {
          address_line: string
          created_at?: string
          id?: string
          label?: string
          lat: number
          lng: number
          user_id: string
        }
        Update: {
          address_line?: string
          created_at?: string
          id?: string
          label?: string
          lat?: number
          lng?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "addresses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          active: boolean
          icon: string
          id: string
          name: string
          name_hi: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          icon?: string
          id?: string
          name: string
          name_hi?: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          icon?: string
          id?: string
          name?: string
          name_hi?: string
          sort_order?: number
        }
        Relationships: []
      }
      order_items: {
        Row: {
          id: string
          order_id: string
          price: number
          product_id: string | null
          product_name: string
          quantity: number
          variant_id: string | null
          variant_unit: string | null
        }
        Insert: {
          id?: string
          order_id: string
          price: number
          product_id?: string | null
          product_name: string
          quantity: number
          variant_id?: string | null
          variant_unit?: string | null
        }
        Update: {
          id?: string
          order_id?: string
          price?: number
          product_id?: string | null
          product_name?: string
          quantity?: number
          variant_id?: string | null
          variant_unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "metrics_stock_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          address_line: string
          coupon_code: string | null
          delivered_at: string | null
          delivery_fee: number
          discount: number
          id: string
          lat: number
          lng: number
          notes: string | null
          payment_method: string | null
          phone: string | null
          placed_at: string
          rider_id: string | null
          status: string
          total: number
          user_id: string
        }
        Insert: {
          address_line: string
          coupon_code?: string | null
          delivered_at?: string | null
          delivery_fee?: number
          discount?: number
          id?: string
          lat: number
          lng: number
          notes?: string | null
          payment_method?: string | null
          phone?: string | null
          placed_at?: string
          rider_id?: string | null
          status?: string
          total: number
          user_id: string
        }
        Update: {
          address_line?: string
          coupon_code?: string | null
          delivered_at?: string | null
          delivery_fee?: number
          discount?: number
          id?: string
          lat?: number
          lng?: number
          notes?: string | null
          payment_method?: string | null
          phone?: string | null
          placed_at?: string
          rider_id?: string | null
          status?: string
          total?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "riders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          created_at: string
          id: string
          image_url: string | null
          is_default: boolean
          mrp: number
          price: number
          product_id: string
          sort_order: number
          stock: number
          unit: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url?: string | null
          is_default?: boolean
          mrp: number
          price: number
          product_id: string
          sort_order?: number
          stock?: number
          unit: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string | null
          is_default?: boolean
          mrp?: number
          price?: number
          product_id?: string
          sort_order?: number
          stock?: number
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "metrics_stock_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          biological_source: string | null
          category_id: string | null
          country_of_origin: string | null
          created_at: string
          customer_care: Json | null
          description: string | null
          disclaimer: string | null
          fat_profile: string | null
          fssai_license: string | null
          id: string
          image_url: string | null
          image_urls: string[] | null
          key_features: string[] | null
          mrp: number
          name: string
          name_hi: string
          nutrition_per_100g: Json | null
          price: number
          processing_type: string | null
          return_policy: string | null
          seller_address: string | null
          seller_fssai: string | null
          seller_name: string | null
          shelf_life: string | null
          stock: number
          sugar_profile: string | null
          unit: string
        }
        Insert: {
          active?: boolean
          biological_source?: string | null
          category_id?: string | null
          country_of_origin?: string | null
          created_at?: string
          customer_care?: Json | null
          description?: string | null
          disclaimer?: string | null
          fat_profile?: string | null
          fssai_license?: string | null
          id?: string
          image_url?: string | null
          image_urls?: string[] | null
          key_features?: string[] | null
          mrp: number
          name: string
          name_hi?: string
          nutrition_per_100g?: Json | null
          price: number
          processing_type?: string | null
          return_policy?: string | null
          seller_address?: string | null
          seller_fssai?: string | null
          seller_name?: string | null
          shelf_life?: string | null
          stock?: number
          sugar_profile?: string | null
          unit?: string
        }
        Update: {
          active?: boolean
          biological_source?: string | null
          category_id?: string | null
          country_of_origin?: string | null
          created_at?: string
          customer_care?: Json | null
          description?: string | null
          disclaimer?: string | null
          fat_profile?: string | null
          fssai_license?: string | null
          id?: string
          image_url?: string | null
          image_urls?: string[] | null
          key_features?: string[] | null
          mrp?: number
          name?: string
          name_hi?: string
          nutrition_per_100g?: Json | null
          price?: number
          processing_type?: string | null
          return_policy?: string | null
          seller_address?: string | null
          seller_fssai?: string | null
          seller_name?: string | null
          shelf_life?: string | null
          stock?: number
          sugar_profile?: string | null
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          id: string
          name: string | null
          phone: string | null
          role: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          id: string
          name?: string | null
          phone?: string | null
          role?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          name?: string | null
          phone?: string | null
          role?: string
        }
        Relationships: []
      }
      riders: {
        Row: {
          active: boolean
          created_at: string
          id: string
          lat: number | null
          lng: number | null
          name: string
          phone: string
          status: string
          vehicle_number: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          name: string
          phone: string
          status?: string
          vehicle_number?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          name?: string
          phone?: string
          status?: string
          vehicle_number?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      metrics_coupons: {
        Row: {
          avg_order_value: number | null
          coupon_code: string | null
          discount_given: number | null
          revenue_with_coupon: number | null
          uses: number | null
        }
        Relationships: []
      }
      metrics_customer_cohorts: {
        Row: {
          new_customer_orders: number | null
          new_revenue: number | null
          repeat_orders: number | null
          repeat_revenue: number | null
        }
        Relationships: []
      }
      metrics_daily_orders: {
        Row: {
          avg_order_value: number | null
          day: string | null
          orders: number | null
          revenue: number | null
        }
        Relationships: []
      }
      metrics_order_status_today: {
        Row: {
          count: number | null
          status: string | null
          total_value: number | null
        }
        Relationships: []
      }
      metrics_slow_queries: {
        Row: {
          "?column?": number | null
        }
        Relationships: []
      }
      metrics_stock_alerts: {
        Row: {
          alert_level: string | null
          id: string | null
          name: string | null
          stock: number | null
        }
        Insert: {
          alert_level?: never
          id?: string | null
          name?: string | null
          stock?: number | null
        }
        Update: {
          alert_level?: never
          id?: string | null
          name?: string | null
          stock?: number | null
        }
        Relationships: []
      }
      metrics_top_products: {
        Row: {
          gross_revenue: number | null
          product_id: string | null
          product_name: string | null
          unique_orders: number | null
          units_sold: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "metrics_stock_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _metrics_exec_sql: { Args: { p_sql: string }; Returns: Json }
      get_metrics_snapshot: { Args: never; Returns: Json }
      place_order_atomic: {
        Args: {
          p_address_line: string
          p_coupon_code: string
          p_delivery_fee: number
          p_discount: number
          p_items: Json
          p_lat: number
          p_lng: number
          p_notes: string
          p_payment_method: string
          p_phone: string
          p_total: number
          p_user_id: string
        }
        Returns: {
          order_id: string
        }[]
      }
      restore_stock_atomic: { Args: { p_items: Json }; Returns: undefined }
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

