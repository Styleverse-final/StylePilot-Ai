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
      agent_kill_switch: {
        Row: {
          engaged: boolean
          engaged_at: string | null
          engaged_by: string | null
          id: number
          reason: string | null
        }
        Insert: {
          engaged?: boolean
          engaged_at?: string | null
          engaged_by?: string | null
          id?: number
          reason?: string | null
        }
        Update: {
          engaged?: boolean
          engaged_at?: string | null
          engaged_by?: string | null
          id?: number
          reason?: string | null
        }
        Relationships: []
      }
      agent_run: {
        Row: {
          agent_name: string
          agent_version: string | null
          brand_id: string | null
          finished_at: string | null
          items_acted: number | null
          items_escalated: number | null
          items_examined: number | null
          run_id: string
          started_at: string
          status: string | null
          summary: string | null
        }
        Insert: {
          agent_name: string
          agent_version?: string | null
          brand_id?: string | null
          finished_at?: string | null
          items_acted?: number | null
          items_escalated?: number | null
          items_examined?: number | null
          run_id: string
          started_at: string
          status?: string | null
          summary?: string | null
        }
        Update: {
          agent_name?: string
          agent_version?: string | null
          brand_id?: string | null
          finished_at?: string | null
          items_acted?: number | null
          items_escalated?: number | null
          items_examined?: number | null
          run_id?: string
          started_at?: string
          status?: string | null
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_run_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "dim_brand"
            referencedColumns: ["brand_id"]
          },
        ]
      }
      autonomy_band: {
        Row: {
          acts_within: string
          agent_name: string
          brand_id: string | null
          enabled: boolean
          escalates_when: string
          id: number
          last_widened_at: string | null
          max_shift_pp: number | null
          max_value_inr: number | null
          owner_employee_id: string | null
          widened_by: string | null
        }
        Insert: {
          acts_within: string
          agent_name: string
          brand_id?: string | null
          enabled?: boolean
          escalates_when: string
          id?: number
          last_widened_at?: string | null
          max_shift_pp?: number | null
          max_value_inr?: number | null
          owner_employee_id?: string | null
          widened_by?: string | null
        }
        Update: {
          acts_within?: string
          agent_name?: string
          brand_id?: string | null
          enabled?: boolean
          escalates_when?: string
          id?: number
          last_widened_at?: string | null
          max_shift_pp?: number | null
          max_value_inr?: number | null
          owner_employee_id?: string | null
          widened_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "autonomy_band_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "dim_brand"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "autonomy_band_owner_employee_id_fkey"
            columns: ["owner_employee_id"]
            isOneToOne: false
            referencedRelation: "dim_planner"
            referencedColumns: ["employee_id"]
          },
        ]
      }
      copilot_log: {
        Row: {
          answer: string | null
          context_hash: string | null
          created_at: string | null
          id: number
          latency_ms: number | null
          model: string | null
          planner_id: string | null
          provider: string | null
          question: string
          retrieved_context: Json | null
          route_suggested: string | null
        }
        Insert: {
          answer?: string | null
          context_hash?: string | null
          created_at?: string | null
          id?: number
          latency_ms?: number | null
          model?: string | null
          planner_id?: string | null
          provider?: string | null
          question: string
          retrieved_context?: Json | null
          route_suggested?: string | null
        }
        Update: {
          answer?: string | null
          context_hash?: string | null
          created_at?: string | null
          id?: number
          latency_ms?: number | null
          model?: string | null
          planner_id?: string | null
          provider?: string | null
          question?: string
          retrieved_context?: Json | null
          route_suggested?: string | null
        }
        Relationships: []
      }
      dim_brand: {
        Row: {
          annual_revenue_cr: number | null
          brand_id: string
          brand_name: string
          case_accuracy: number | null
          gross_margin: number | null
          in_pilot: boolean | null
          markdown_pool_cr: number | null
          positioning: string | null
          revenue_share: number | null
        }
        Insert: {
          annual_revenue_cr?: number | null
          brand_id: string
          brand_name: string
          case_accuracy?: number | null
          gross_margin?: number | null
          in_pilot?: boolean | null
          markdown_pool_cr?: number | null
          positioning?: string | null
          revenue_share?: number | null
        }
        Update: {
          annual_revenue_cr?: number | null
          brand_id?: string
          brand_name?: string
          case_accuracy?: number | null
          gross_margin?: number | null
          in_pilot?: boolean | null
          markdown_pool_cr?: number | null
          positioning?: string | null
          revenue_share?: number | null
        }
        Relationships: []
      }
      dim_category: {
        Row: {
          category_id: string
          category_name: string | null
          typical_life_weeks: number | null
          typical_margin: number | null
        }
        Insert: {
          category_id: string
          category_name?: string | null
          typical_life_weeks?: number | null
          typical_margin?: number | null
        }
        Update: {
          category_id?: string
          category_name?: string | null
          typical_life_weeks?: number | null
          typical_margin?: number | null
        }
        Relationships: []
      }
      dim_channel: {
        Row: {
          channel_id: string
          channel_name: string | null
          lead_time_weeks: number | null
        }
        Insert: {
          channel_id: string
          channel_name?: string | null
          lead_time_weeks?: number | null
        }
        Update: {
          channel_id?: string
          channel_name?: string | null
          lead_time_weeks?: number | null
        }
        Relationships: []
      }
      dim_planner: {
        Row: {
          ai_readiness_score: number | null
          app_role: string
          auth_user_id: string | null
          brand_id: string | null
          categories_owned: string | null
          employee_id: string
          full_name: string | null
          in_pilot_wave: string | null
          is_active: boolean | null
          learning_tier: string | null
          pct_allocation: number | null
          pct_assortment: number | null
          pct_commercial_strategy: number | null
          pct_demand_forecasting: number | null
          pct_meetings: number | null
          pct_reporting: number | null
          region_id: string | null
          role: string | null
          structured_learning_hours_last_year: number | null
        }
        Insert: {
          ai_readiness_score?: number | null
          app_role?: string
          auth_user_id?: string | null
          brand_id?: string | null
          categories_owned?: string | null
          employee_id: string
          full_name?: string | null
          in_pilot_wave?: string | null
          is_active?: boolean | null
          learning_tier?: string | null
          pct_allocation?: number | null
          pct_assortment?: number | null
          pct_commercial_strategy?: number | null
          pct_demand_forecasting?: number | null
          pct_meetings?: number | null
          pct_reporting?: number | null
          region_id?: string | null
          role?: string | null
          structured_learning_hours_last_year?: number | null
        }
        Update: {
          ai_readiness_score?: number | null
          app_role?: string
          auth_user_id?: string | null
          brand_id?: string | null
          categories_owned?: string | null
          employee_id?: string
          full_name?: string | null
          in_pilot_wave?: string | null
          is_active?: boolean | null
          learning_tier?: string | null
          pct_allocation?: number | null
          pct_assortment?: number | null
          pct_commercial_strategy?: number | null
          pct_demand_forecasting?: number | null
          pct_meetings?: number | null
          pct_reporting?: number | null
          region_id?: string | null
          role?: string | null
          structured_learning_hours_last_year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dim_planner_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "dim_brand"
            referencedColumns: ["brand_id"]
          },
        ]
      }
      dim_region: {
        Row: {
          country: string | null
          region_id: string
          region_name: string | null
        }
        Insert: {
          country?: string | null
          region_id: string
          region_name?: string | null
        }
        Update: {
          country?: string | null
          region_id?: string
          region_name?: string | null
        }
        Relationships: []
      }
      dim_sku: {
        Row: {
          attribute_completeness_pct: number | null
          brand_id: string | null
          category_id: string | null
          gross_margin_pct: number | null
          launch_week: string | null
          list_price_inr: number | null
          newness_class: string | null
          status: string | null
          style_id: string
          style_name: string | null
        }
        Insert: {
          attribute_completeness_pct?: number | null
          brand_id?: string | null
          category_id?: string | null
          gross_margin_pct?: number | null
          launch_week?: string | null
          list_price_inr?: number | null
          newness_class?: string | null
          status?: string | null
          style_id: string
          style_name?: string | null
        }
        Update: {
          attribute_completeness_pct?: number | null
          brand_id?: string | null
          category_id?: string | null
          gross_margin_pct?: number | null
          launch_week?: string | null
          list_price_inr?: number | null
          newness_class?: string | null
          status?: string | null
          style_id?: string
          style_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dim_sku_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "dim_brand"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "dim_sku_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "dim_category"
            referencedColumns: ["category_id"]
          },
        ]
      }
      downstream_handoff: {
        Row: {
          brand_id: string | null
          function: string
          generated_at: string
          id: number
          insight: string
          iso_week: string
          source_table: string | null
          supporting_metric: string | null
        }
        Insert: {
          brand_id?: string | null
          function: string
          generated_at: string
          id?: number
          insight: string
          iso_week: string
          source_table?: string | null
          supporting_metric?: string | null
        }
        Update: {
          brand_id?: string | null
          function?: string
          generated_at?: string
          id?: number
          insight?: string
          iso_week?: string
          source_table?: string | null
          supporting_metric?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "downstream_handoff_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "dim_brand"
            referencedColumns: ["brand_id"]
          },
        ]
      }
      elasticity: {
        Row: {
          brand_id: string | null
          category_id: string | null
          coefficient: number | null
          fitted_at: string
          id: number
          intercept: number | null
          is_pooled_fallback: boolean
          n_observations: number | null
          r_squared: number | null
        }
        Insert: {
          brand_id?: string | null
          category_id?: string | null
          coefficient?: number | null
          fitted_at: string
          id?: number
          intercept?: number | null
          is_pooled_fallback?: boolean
          n_observations?: number | null
          r_squared?: number | null
        }
        Update: {
          brand_id?: string | null
          category_id?: string | null
          coefficient?: number | null
          fitted_at?: string
          id?: number
          intercept?: number | null
          is_pooled_fallback?: boolean
          n_observations?: number | null
          r_squared?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "elasticity_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "dim_brand"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "elasticity_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "dim_category"
            referencedColumns: ["category_id"]
          },
        ]
      }
      embargo_control: {
        Row: {
          brand_id: string | null
          id: number
          iso_week: string
          planning_grain_rows: number | null
          reveal_on: string
          status_at_generation: string | null
          style_rows: number | null
          week_end: string | null
          week_start: string
        }
        Insert: {
          brand_id?: string | null
          id?: number
          iso_week: string
          planning_grain_rows?: number | null
          reveal_on: string
          status_at_generation?: string | null
          style_rows?: number | null
          week_end?: string | null
          week_start: string
        }
        Update: {
          brand_id?: string | null
          id?: number
          iso_week?: string
          planning_grain_rows?: number | null
          reveal_on?: string
          status_at_generation?: string | null
          style_rows?: number | null
          week_end?: string | null
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "embargo_control_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "dim_brand"
            referencedColumns: ["brand_id"]
          },
        ]
      }
      fact_demand_weekly: {
        Row: {
          availability_ratio: number | null
          brand_id: string | null
          category_id: string | null
          channel_id: string | null
          closing_inventory_units: number | null
          demand_units_unconstrained: number | null
          excluded_from_accuracy_scoring: boolean | null
          id: number
          iso_week: string
          manual_baseline_forecast_units: number | null
          markdown_loss_inr: number | null
          markdown_units: number | null
          net_revenue_inr: number | null
          region_id: string | null
          sales_units: number | null
          week_start: string
        }
        Insert: {
          availability_ratio?: number | null
          brand_id?: string | null
          category_id?: string | null
          channel_id?: string | null
          closing_inventory_units?: number | null
          demand_units_unconstrained?: number | null
          excluded_from_accuracy_scoring?: boolean | null
          id?: number
          iso_week: string
          manual_baseline_forecast_units?: number | null
          markdown_loss_inr?: number | null
          markdown_units?: number | null
          net_revenue_inr?: number | null
          region_id?: string | null
          sales_units?: number | null
          week_start: string
        }
        Update: {
          availability_ratio?: number | null
          brand_id?: string | null
          category_id?: string | null
          channel_id?: string | null
          closing_inventory_units?: number | null
          demand_units_unconstrained?: number | null
          excluded_from_accuracy_scoring?: boolean | null
          id?: number
          iso_week?: string
          manual_baseline_forecast_units?: number | null
          markdown_loss_inr?: number | null
          markdown_units?: number | null
          net_revenue_inr?: number | null
          region_id?: string | null
          sales_units?: number | null
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "fact_demand_weekly_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "dim_brand"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "fact_demand_weekly_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "dim_category"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "fact_demand_weekly_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "dim_channel"
            referencedColumns: ["channel_id"]
          },
          {
            foreignKeyName: "fact_demand_weekly_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "dim_region"
            referencedColumns: ["region_id"]
          },
        ]
      }
      forecast: {
        Row: {
          avg_selling_price_inr: number | null
          brand_id: string | null
          category_id: string | null
          channel_id: string | null
          drivers: Json | null
          forecast_units: number
          generated_at: string
          horizon_week: number
          id: number
          iso_week: string
          manual_baseline_forecast_units: number | null
          model_version: string
          p10: number | null
          p90: number | null
          region_id: string | null
          week_start: string
        }
        Insert: {
          avg_selling_price_inr?: number | null
          brand_id?: string | null
          category_id?: string | null
          channel_id?: string | null
          drivers?: Json | null
          forecast_units: number
          generated_at: string
          horizon_week: number
          id?: number
          iso_week: string
          manual_baseline_forecast_units?: number | null
          model_version: string
          p10?: number | null
          p90?: number | null
          region_id?: string | null
          week_start: string
        }
        Update: {
          avg_selling_price_inr?: number | null
          brand_id?: string | null
          category_id?: string | null
          channel_id?: string | null
          drivers?: Json | null
          forecast_units?: number
          generated_at?: string
          horizon_week?: number
          id?: number
          iso_week?: string
          manual_baseline_forecast_units?: number | null
          model_version?: string
          p10?: number | null
          p90?: number | null
          region_id?: string | null
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "forecast_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "dim_brand"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "forecast_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "dim_category"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "forecast_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "dim_channel"
            referencedColumns: ["channel_id"]
          },
          {
            foreignKeyName: "forecast_model_version_fkey"
            columns: ["model_version"]
            isOneToOne: false
            referencedRelation: "model_registry"
            referencedColumns: ["model_version"]
          },
          {
            foreignKeyName: "forecast_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "dim_region"
            referencedColumns: ["region_id"]
          },
        ]
      }
      launch_forecast: {
        Row: {
          analogues: Json | null
          attribute_completeness_pct: number | null
          brand_id: string | null
          category_id: string | null
          confidence: string | null
          forecast_first_8wk: number | null
          generated_at: string
          id: number
          launch_week: string | null
          list_price_inr: number | null
          model_version: string
          newness_class: string | null
          opening_buy_ratio: number | null
          recommended_opening_buy: number | null
          style_id: string
          style_name: string | null
        }
        Insert: {
          analogues?: Json | null
          attribute_completeness_pct?: number | null
          brand_id?: string | null
          category_id?: string | null
          confidence?: string | null
          forecast_first_8wk?: number | null
          generated_at: string
          id?: number
          launch_week?: string | null
          list_price_inr?: number | null
          model_version: string
          newness_class?: string | null
          opening_buy_ratio?: number | null
          recommended_opening_buy?: number | null
          style_id: string
          style_name?: string | null
        }
        Update: {
          analogues?: Json | null
          attribute_completeness_pct?: number | null
          brand_id?: string | null
          category_id?: string | null
          confidence?: string | null
          forecast_first_8wk?: number | null
          generated_at?: string
          id?: number
          launch_week?: string | null
          list_price_inr?: number | null
          model_version?: string
          newness_class?: string | null
          opening_buy_ratio?: number | null
          recommended_opening_buy?: number | null
          style_id?: string
          style_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "launch_forecast_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "dim_brand"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "launch_forecast_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "dim_category"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "launch_forecast_model_version_fkey"
            columns: ["model_version"]
            isOneToOne: false
            referencedRelation: "model_registry"
            referencedColumns: ["model_version"]
          },
          {
            foreignKeyName: "launch_forecast_style_id_fkey"
            columns: ["style_id"]
            isOneToOne: false
            referencedRelation: "dim_sku"
            referencedColumns: ["style_id"]
          },
        ]
      }
      learning_completion: {
        Row: {
          completed_at: string | null
          employee_id: string
          id: number
          module_id: string
          score: number | null
          started_at: string | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          employee_id: string
          id?: number
          module_id: string
          score?: number | null
          started_at?: string | null
          status: string
        }
        Update: {
          completed_at?: string | null
          employee_id?: string
          id?: number
          module_id?: string
          score?: number | null
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_completion_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "dim_planner"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "learning_completion_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "learning_module"
            referencedColumns: ["module_id"]
          },
        ]
      }
      learning_module: {
        Row: {
          description: string
          duration_hours: number
          format: string
          module_id: string
          segment: string
          sequence: number
          tier: string
          title: string
          unlocks_capability: string
        }
        Insert: {
          description: string
          duration_hours: number
          format: string
          module_id: string
          segment: string
          sequence: number
          tier: string
          title: string
          unlocks_capability: string
        }
        Update: {
          description?: string
          duration_hours?: number
          format?: string
          module_id?: string
          segment?: string
          sequence?: number
          tier?: string
          title?: string
          unlocks_capability?: string
        }
        Relationships: []
      }
      markdown_recommendation: {
        Row: {
          brand_id: string | null
          category_id: string | null
          current_cover_weeks: number | null
          generated_at: string
          id: number
          margin_if_delayed: number | null
          margin_if_now: number | null
          margin_saved: number | null
          model_version: string
          projected_leftover_units: number | null
          rationale: string
          recommended_depth: number | null
          recommended_week: number | null
          remaining_life_weeks: number | null
          style_id: string | null
          style_name: string | null
          timing: string | null
          weeks_since_launch: number | null
        }
        Insert: {
          brand_id?: string | null
          category_id?: string | null
          current_cover_weeks?: number | null
          generated_at: string
          id?: number
          margin_if_delayed?: number | null
          margin_if_now?: number | null
          margin_saved?: number | null
          model_version: string
          projected_leftover_units?: number | null
          rationale: string
          recommended_depth?: number | null
          recommended_week?: number | null
          remaining_life_weeks?: number | null
          style_id?: string | null
          style_name?: string | null
          timing?: string | null
          weeks_since_launch?: number | null
        }
        Update: {
          brand_id?: string | null
          category_id?: string | null
          current_cover_weeks?: number | null
          generated_at?: string
          id?: number
          margin_if_delayed?: number | null
          margin_if_now?: number | null
          margin_saved?: number | null
          model_version?: string
          projected_leftover_units?: number | null
          rationale?: string
          recommended_depth?: number | null
          recommended_week?: number | null
          remaining_life_weeks?: number | null
          style_id?: string | null
          style_name?: string | null
          timing?: string | null
          weeks_since_launch?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "markdown_recommendation_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "dim_brand"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "markdown_recommendation_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "dim_category"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "markdown_recommendation_style_id_fkey"
            columns: ["style_id"]
            isOneToOne: false
            referencedRelation: "dim_sku"
            referencedColumns: ["style_id"]
          },
        ]
      }
      model_registry: {
        Row: {
          accuracy_metric: string
          engine: string
          features: Json | null
          horizon_weeks: number
          metrics: Json
          model_id: string
          model_version: string
          n_train_rows: number | null
          target_column: string
          trained_at: string
        }
        Insert: {
          accuracy_metric: string
          engine: string
          features?: Json | null
          horizon_weeks: number
          metrics: Json
          model_id: string
          model_version: string
          n_train_rows?: number | null
          target_column: string
          trained_at: string
        }
        Update: {
          accuracy_metric?: string
          engine?: string
          features?: Json | null
          horizon_weeks?: number
          metrics?: Json
          model_id?: string
          model_version?: string
          n_train_rows?: number | null
          target_column?: string
          trained_at?: string
        }
        Relationships: []
      }
      planner_adoption: {
        Row: {
          adoption_index: number | null
          apprehension: number | null
          brand_id: string | null
          employee_id: string
          in_pilot_wave: string | null
          rationale: string | null
          readiness: number | null
          recommended_learning_hours: number | null
          role: string | null
          segment: string | null
        }
        Insert: {
          adoption_index?: number | null
          apprehension?: number | null
          brand_id?: string | null
          employee_id: string
          in_pilot_wave?: string | null
          rationale?: string | null
          readiness?: number | null
          recommended_learning_hours?: number | null
          role?: string | null
          segment?: string | null
        }
        Update: {
          adoption_index?: number | null
          apprehension?: number | null
          brand_id?: string | null
          employee_id?: string
          in_pilot_wave?: string | null
          rationale?: string | null
          readiness?: number | null
          recommended_learning_hours?: number | null
          role?: string | null
          segment?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "planner_adoption_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "dim_brand"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "planner_adoption_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "dim_planner"
            referencedColumns: ["employee_id"]
          },
        ]
      }
      planner_decision: {
        Row: {
          accepted_value: number | null
          accountable_planner: string
          actor_id: string | null
          actor_type: string
          decided_at: string | null
          id: number
          model_version: string
          override_reason: string | null
          planner_id: string | null
          recommendation_id: number
          recommended_value: number | null
          status: Database["public"]["Enums"]["decision_status"]
        }
        Insert: {
          accepted_value?: number | null
          accountable_planner: string
          actor_id?: string | null
          actor_type?: string
          decided_at?: string | null
          id?: number
          model_version: string
          override_reason?: string | null
          planner_id?: string | null
          recommendation_id: number
          recommended_value?: number | null
          status: Database["public"]["Enums"]["decision_status"]
        }
        Update: {
          accepted_value?: number | null
          accountable_planner?: string
          actor_id?: string | null
          actor_type?: string
          decided_at?: string | null
          id?: number
          model_version?: string
          override_reason?: string | null
          planner_id?: string | null
          recommendation_id?: number
          recommended_value?: number | null
          status?: Database["public"]["Enums"]["decision_status"]
        }
        Relationships: [
          {
            foreignKeyName: "planner_decision_planner_id_fkey"
            columns: ["planner_id"]
            isOneToOne: false
            referencedRelation: "dim_planner"
            referencedColumns: ["employee_id"]
          },
          {
            foreignKeyName: "planner_decision_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "recommendation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planner_decision_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "v_recommendation_state"
            referencedColumns: ["id"]
          },
        ]
      }
      policy_parameter: {
        Row: {
          applied_value: number | null
          basis: string
          brand_id: string | null
          computed_value: number | null
          id: number
          override_reason: string | null
          param_name: string
          set_at: string
          set_by: string | null
        }
        Insert: {
          applied_value?: number | null
          basis: string
          brand_id?: string | null
          computed_value?: number | null
          id?: number
          override_reason?: string | null
          param_name: string
          set_at: string
          set_by?: string | null
        }
        Update: {
          applied_value?: number | null
          basis?: string
          brand_id?: string | null
          computed_value?: number | null
          id?: number
          override_reason?: string | null
          param_name?: string
          set_at?: string
          set_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "policy_parameter_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "dim_brand"
            referencedColumns: ["brand_id"]
          },
        ]
      }
      recommendation: {
        Row: {
          action: Database["public"]["Enums"]["rec_action"]
          brand_id: string | null
          category_id: string | null
          channel_id: string | null
          confidence: string | null
          created_at: string | null
          drivers: Json | null
          generated_at: string
          id: number
          model_version: string
          payload: Json
          rationale: string
          rec_type: Database["public"]["Enums"]["rec_type"]
          region_id: string | null
          series_key: string | null
          severity: string | null
          value_at_stake_inr: number | null
        }
        Insert: {
          action: Database["public"]["Enums"]["rec_action"]
          brand_id?: string | null
          category_id?: string | null
          channel_id?: string | null
          confidence?: string | null
          created_at?: string | null
          drivers?: Json | null
          generated_at: string
          id?: number
          model_version: string
          payload: Json
          rationale: string
          rec_type: Database["public"]["Enums"]["rec_type"]
          region_id?: string | null
          series_key?: string | null
          severity?: string | null
          value_at_stake_inr?: number | null
        }
        Update: {
          action?: Database["public"]["Enums"]["rec_action"]
          brand_id?: string | null
          category_id?: string | null
          channel_id?: string | null
          confidence?: string | null
          created_at?: string | null
          drivers?: Json | null
          generated_at?: string
          id?: number
          model_version?: string
          payload?: Json
          rationale?: string
          rec_type?: Database["public"]["Enums"]["rec_type"]
          region_id?: string | null
          series_key?: string | null
          severity?: string | null
          value_at_stake_inr?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "recommendation_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "dim_brand"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "recommendation_model_version_fkey"
            columns: ["model_version"]
            isOneToOne: false
            referencedRelation: "model_registry"
            referencedColumns: ["model_version"]
          },
        ]
      }
      signal_intelligence: {
        Row: {
          brand_id: string | null
          category_id: string | null
          competitor_activity_index: number | null
          competitor_price_index: number | null
          id: number
          iso_week: string
          lead_correlation: number | null
          measured_lead_weeks: number | null
          search_interest_index: number | null
          social_trend_index: number | null
          trend_confidence_band: string | null
          trend_momentum: number | null
          week_start: string
        }
        Insert: {
          brand_id?: string | null
          category_id?: string | null
          competitor_activity_index?: number | null
          competitor_price_index?: number | null
          id?: number
          iso_week: string
          lead_correlation?: number | null
          measured_lead_weeks?: number | null
          search_interest_index?: number | null
          social_trend_index?: number | null
          trend_confidence_band?: string | null
          trend_momentum?: number | null
          week_start: string
        }
        Update: {
          brand_id?: string | null
          category_id?: string | null
          competitor_activity_index?: number | null
          competitor_price_index?: number | null
          id?: number
          iso_week?: string
          lead_correlation?: number | null
          measured_lead_weeks?: number | null
          search_interest_index?: number | null
          social_trend_index?: number | null
          trend_confidence_band?: string | null
          trend_momentum?: number | null
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "signal_intelligence_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "dim_brand"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "signal_intelligence_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "dim_category"
            referencedColumns: ["category_id"]
          },
        ]
      }
      value_summary: {
        Row: {
          basis: string
          brand_id: string | null
          generated_at: string | null
          holding_cost_change_inr: number | null
          id: number
          lost_sales_recovered_margin_inr: number | null
          markdown_avoided_margin_inr: number | null
          scope: string
          total_margin_inr: number | null
          unit_change_pct: number | null
        }
        Insert: {
          basis: string
          brand_id?: string | null
          generated_at?: string | null
          holding_cost_change_inr?: number | null
          id?: number
          lost_sales_recovered_margin_inr?: number | null
          markdown_avoided_margin_inr?: number | null
          scope: string
          total_margin_inr?: number | null
          unit_change_pct?: number | null
        }
        Update: {
          basis?: string
          brand_id?: string | null
          generated_at?: string | null
          holding_cost_change_inr?: number | null
          id?: number
          lost_sales_recovered_margin_inr?: number | null
          markdown_avoided_margin_inr?: number | null
          scope?: string
          total_margin_inr?: number | null
          unit_change_pct?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      v_adoption_kpi: {
        Row: {
          approval_rate_pct: number | null
          approved: number | null
          brand_id: string | null
          decided: number | null
          modified: number | null
          rec_type: Database["public"]["Enums"]["rec_type"] | null
          rejected: number | null
          total_recs: number | null
          value_actioned_inr: number | null
        }
        Relationships: [
          {
            foreignKeyName: "recommendation_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "dim_brand"
            referencedColumns: ["brand_id"]
          },
        ]
      }
      v_embargo_status: {
        Row: {
          brand_id: string | null
          first_reveal_on: string | null
          latest_revealed_week: string | null
          next_reveal_on: string | null
          weeks_revealed: number | null
          weeks_total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "embargo_control_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "dim_brand"
            referencedColumns: ["brand_id"]
          },
        ]
      }
      v_recommendation_state: {
        Row: {
          accepted_value: number | null
          accountable_planner: string | null
          action: Database["public"]["Enums"]["rec_action"] | null
          brand_id: string | null
          category_id: string | null
          channel_id: string | null
          confidence: string | null
          created_at: string | null
          decided_at: string | null
          drivers: Json | null
          generated_at: string | null
          id: number | null
          model_version: string | null
          override_reason: string | null
          payload: Json | null
          rationale: string | null
          rec_type: Database["public"]["Enums"]["rec_type"] | null
          region_id: string | null
          series_key: string | null
          severity: string | null
          status: Database["public"]["Enums"]["decision_status"] | null
          value_at_stake_inr: number | null
        }
        Relationships: [
          {
            foreignKeyName: "recommendation_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "dim_brand"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "recommendation_model_version_fkey"
            columns: ["model_version"]
            isOneToOne: false
            referencedRelation: "model_registry"
            referencedColumns: ["model_version"]
          },
        ]
      }
      v_time_reallocation: {
        Row: {
          brand_id: string | null
          pct_allocation: number | null
          pct_assortment: number | null
          pct_commercial_strategy: number | null
          pct_demand_forecasting: number | null
          pct_meetings: number | null
          pct_reporting: number | null
          planners: number | null
          role: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dim_planner_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "dim_brand"
            referencedColumns: ["brand_id"]
          },
        ]
      }
      v_touchless_rate: {
        Row: {
          agent_acted: number | null
          agent_escalated: number | null
          buy_out_of_agent_scope: number | null
          forecast_escalated: number | null
          framing: string | null
          in_scope_denominator: number | null
          in_scope_rate: number | null
          overall_rate: number | null
          recommendations_total: number | null
          run_at: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      current_app_role: { Args: never; Returns: string }
      current_brand: { Args: never; Returns: string }
      current_categories: { Args: never; Returns: string[] }
      current_planner: {
        Args: never
        Returns: {
          ai_readiness_score: number | null
          app_role: string
          auth_user_id: string | null
          brand_id: string | null
          categories_owned: string | null
          employee_id: string
          full_name: string | null
          in_pilot_wave: string | null
          is_active: boolean | null
          learning_tier: string | null
          pct_allocation: number | null
          pct_assortment: number | null
          pct_commercial_strategy: number | null
          pct_demand_forecasting: number | null
          pct_meetings: number | null
          pct_reporting: number | null
          region_id: string | null
          role: string | null
          structured_learning_hours_last_year: number | null
        }
        SetofOptions: {
          from: "*"
          to: "dim_planner"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_region: { Args: never; Returns: string }
      in_scope: {
        Args: { p_brand: string; p_category: string; p_region: string }
        Returns: boolean
      }
      markdown_concentration: {
        Args: { p_since: string }
        Returns: {
          brand_id: string
          category_id: string
          loss_inr: number
          region_id: string
          revenue_inr: number
          units: number
        }[]
      }
      modules_for: {
        Args: { p_segment: string; p_tier: string }
        Returns: {
          description: string
          duration_hours: number
          format: string
          module_id: string
          segment: string
          sequence: number
          tier: string
          title: string
          unlocks_capability: string
        }[]
        SetofOptions: {
          from: "*"
          to: "learning_module"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      owns_category: { Args: { cat: string }; Returns: boolean }
      touchless_totals: {
        Args: never
        Returns: {
          all_recs: number
          brand_id: string
          buy_recs: number
        }[]
      }
    }
    Enums: {
      decision_status: "APPROVED" | "MODIFIED" | "REJECTED" | "SCENARIO"
      rec_action:
        | "INCREASE_BUY"
        | "REDUCE_BUY"
        | "HOLD"
        | "SHIFT_IN"
        | "SHIFT_OUT"
        | "STOCKOUT_RISK"
        | "OVERSTOCK_RISK"
      rec_type: "BUY_QUANTITY" | "ALLOCATION" | "EXCEPTION"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      decision_status: ["APPROVED", "MODIFIED", "REJECTED", "SCENARIO"],
      rec_action: [
        "INCREASE_BUY",
        "REDUCE_BUY",
        "HOLD",
        "SHIFT_IN",
        "SHIFT_OUT",
        "STOCKOUT_RISK",
        "OVERSTOCK_RISK",
      ],
      rec_type: ["BUY_QUANTITY", "ALLOCATION", "EXCEPTION"],
    },
  },
} as const
