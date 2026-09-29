// Generated database contract for the root Supabase migrations.
// Regenerate with: supabase gen types typescript --local > packages/frontend/types/supabase.ts
// The local CLI/container was unavailable while this source contract was prepared;
// keep this file in lockstep with supabase/migrations/.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      user_preferences: {
        Row: {
          user_id: string;
          default_scenario: "sunny" | "rainy" | "heatwave";
          compact_navigation: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          default_scenario?: "sunny" | "rainy" | "heatwave";
          compact_navigation?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          default_scenario?: "sunny" | "rainy" | "heatwave";
          compact_navigation?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_preferences_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      linked_wallets: {
        Row: {
          id: string;
          user_id: string;
          wallet_address: string;
          chain_id: number;
          verification_method: "eip191";
          verified_at: string;
          unlinked_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          wallet_address: string;
          chain_id: number;
          verification_method?: "eip191";
          verified_at: string;
          unlinked_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          wallet_address?: string;
          chain_id?: number;
          verification_method?: "eip191";
          verified_at?: string;
          unlinked_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "linked_wallets_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      house_registration_drafts: {
        Row: {
          draft_id: string;
          user_id: string;
          label: string;
          solar_enabled: boolean;
          battery_enabled: boolean;
          battery_capacity_wh: number | null;
          updated_at: string;
          created_at: string;
        };
        Insert: {
          draft_id?: string;
          user_id: string;
          label?: string;
          solar_enabled?: boolean;
          battery_enabled?: boolean;
          battery_capacity_wh?: number | null;
          updated_at?: string;
          created_at?: string;
        };
        Update: {
          draft_id?: string;
          user_id?: string;
          label?: string;
          solar_enabled?: boolean;
          battery_enabled?: boolean;
          battery_capacity_wh?: number | null;
          updated_at?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "house_registration_drafts_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      saved_days: {
        Row: {
          user_id: string;
          day_id: string;
          chain_id: number;
          market_address: string;
          scenario: "sunny" | "rainy" | "heatwave";
          seed: string;
          saved_at: string;
        };
        Insert: {
          user_id: string;
          day_id: string;
          chain_id: number;
          market_address: string;
          scenario: "sunny" | "rainy" | "heatwave";
          seed: string;
          saved_at: string;
        };
        Update: {
          user_id?: string;
          day_id?: string;
          chain_id?: number;
          market_address?: string;
          scenario?: "sunny" | "rainy" | "heatwave";
          seed?: string;
          saved_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "saved_days_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  auth: {
    Tables: {
      users: {
        Row: { id: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

export type PublicTables = Database["public"]["Tables"];
