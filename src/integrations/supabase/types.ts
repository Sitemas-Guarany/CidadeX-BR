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
      access_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: string | null
          metadata: Json | null
          resource_id: string | null
          resource_type: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          resource_id?: string | null
          resource_type: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          resource_id?: string | null
          resource_type?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      agenda_attachments: {
        Row: {
          agenda_item_id: string
          created_at: string
          display_name: string | null
          file_name: string
          file_size: number
          file_type: string
          file_url: string
          id: string
          user_id: string
        }
        Insert: {
          agenda_item_id: string
          created_at?: string
          display_name?: string | null
          file_name: string
          file_size?: number
          file_type?: string
          file_url: string
          id?: string
          user_id: string
        }
        Update: {
          agenda_item_id?: string
          created_at?: string
          display_name?: string | null
          file_name?: string
          file_size?: number
          file_type?: string
          file_url?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agenda_attachments_agenda_item_id_fkey"
            columns: ["agenda_item_id"]
            isOneToOne: false
            referencedRelation: "agenda_items"
            referencedColumns: ["id"]
          },
        ]
      }
      agenda_items: {
        Row: {
          category: string
          completion_date: string | null
          created_at: string
          description: string | null
          destination_address: string | null
          destination_city: string | null
          destination_mobile: string | null
          destination_name: string | null
          destination_neighborhood: string | null
          destination_number: string | null
          destination_phone: string | null
          destination_zipcode: string | null
          id: string
          origin_address: string | null
          origin_city: string | null
          origin_mobile: string | null
          origin_name: string | null
          origin_neighborhood: string | null
          origin_number: string | null
          origin_phone: string | null
          position: number | null
          profession: string | null
          professional_name: string | null
          referente: string | null
          reminder_minutes: number | null
          scheduled_date: string
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          completion_date?: string | null
          created_at?: string
          description?: string | null
          destination_address?: string | null
          destination_city?: string | null
          destination_mobile?: string | null
          destination_name?: string | null
          destination_neighborhood?: string | null
          destination_number?: string | null
          destination_phone?: string | null
          destination_zipcode?: string | null
          id?: string
          origin_address?: string | null
          origin_city?: string | null
          origin_mobile?: string | null
          origin_name?: string | null
          origin_neighborhood?: string | null
          origin_number?: string | null
          origin_phone?: string | null
          position?: number | null
          profession?: string | null
          professional_name?: string | null
          referente?: string | null
          reminder_minutes?: number | null
          scheduled_date: string
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          completion_date?: string | null
          created_at?: string
          description?: string | null
          destination_address?: string | null
          destination_city?: string | null
          destination_mobile?: string | null
          destination_name?: string | null
          destination_neighborhood?: string | null
          destination_number?: string | null
          destination_phone?: string | null
          destination_zipcode?: string | null
          id?: string
          origin_address?: string | null
          origin_city?: string | null
          origin_mobile?: string | null
          origin_name?: string | null
          origin_neighborhood?: string | null
          origin_number?: string | null
          origin_phone?: string | null
          position?: number | null
          profession?: string | null
          professional_name?: string | null
          referente?: string | null
          reminder_minutes?: number | null
          scheduled_date?: string
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_conversations: {
        Row: {
          city_name: string
          created_at: string
          id: string
          messages: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          city_name: string
          created_at?: string
          id?: string
          messages?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          city_name?: string
          created_at?: string
          id?: string
          messages?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      alert_votes: {
        Row: {
          alert_id: string
          created_at: string
          id: string
          user_id: string
          vote_type: string
        }
        Insert: {
          alert_id: string
          created_at?: string
          id?: string
          user_id: string
          vote_type: string
        }
        Update: {
          alert_id?: string
          created_at?: string
          id?: string
          user_id?: string
          vote_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_votes_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "traffic_alerts"
            referencedColumns: ["id"]
          },
        ]
      }
      banner_legends: {
        Row: {
          active: boolean
          city_id: string | null
          created_at: string
          created_by: string | null
          id: string
          link_url: string | null
          logo_url: string | null
          position: number
          text: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          city_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          link_url?: string | null
          logo_url?: string | null
          position?: number
          text: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          city_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          link_url?: string | null
          logo_url?: string | null
          position?: number
          text?: string
          updated_at?: string
        }
        Relationships: []
      }
      call_signals: {
        Row: {
          callee_id: string
          caller_id: string
          created_at: string
          id: string
          signal_data: Json
          signal_type: string
        }
        Insert: {
          callee_id: string
          caller_id: string
          created_at?: string
          id?: string
          signal_data?: Json
          signal_type: string
        }
        Update: {
          callee_id?: string
          caller_id?: string
          created_at?: string
          id?: string
          signal_data?: Json
          signal_type?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          city_id: string
          created_at: string
          id: string
          image_url: string | null
          message: string
          user_id: string
          video_url: string | null
        }
        Insert: {
          city_id: string
          created_at?: string
          id?: string
          image_url?: string | null
          message: string
          user_id: string
          video_url?: string | null
        }
        Update: {
          city_id?: string
          created_at?: string
          id?: string
          image_url?: string | null
          message?: string
          user_id?: string
          video_url?: string | null
        }
        Relationships: []
      }
      contacts: {
        Row: {
          contact_user_id: string
          created_at: string
          id: string
          nickname: string | null
          user_id: string
        }
        Insert: {
          contact_user_id: string
          created_at?: string
          id?: string
          nickname?: string | null
          user_id: string
        }
        Update: {
          contact_user_id?: string
          created_at?: string
          id?: string
          nickname?: string | null
          user_id?: string
        }
        Relationships: []
      }
      direct_messages: {
        Row: {
          audio_url: string | null
          content: string
          created_at: string
          edited_at: string | null
          id: string
          image_url: string | null
          read_at: string | null
          receiver_id: string
          reply_to_id: string | null
          sender_id: string
        }
        Insert: {
          audio_url?: string | null
          content?: string
          created_at?: string
          edited_at?: string | null
          id?: string
          image_url?: string | null
          read_at?: string | null
          receiver_id: string
          reply_to_id?: string | null
          sender_id: string
        }
        Update: {
          audio_url?: string | null
          content?: string
          created_at?: string
          edited_at?: string | null
          id?: string
          image_url?: string | null
          read_at?: string | null
          receiver_id?: string
          reply_to_id?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "direct_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "direct_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      doctors: {
        Row: {
          address: string | null
          created_at: string
          id: string
          mobile: string | null
          name: string
          phone: string | null
          specialty: string | null
          user_id: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          mobile?: string | null
          name: string
          phone?: string | null
          specialty?: string | null
          user_id: string
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          mobile?: string | null
          name?: string
          phone?: string | null
          specialty?: string | null
          user_id?: string
        }
        Relationships: []
      }
      events_cache: {
        Row: {
          citations: Json
          city_name: string
          created_at: string
          events: Json
          id: string
        }
        Insert: {
          citations?: Json
          city_name: string
          created_at?: string
          events?: Json
          id?: string
        }
        Update: {
          citations?: Json
          city_name?: string
          created_at?: string
          events?: Json
          id?: string
        }
        Relationships: []
      }
      financial_accounts: {
        Row: {
          account_digit: string | null
          account_number: string | null
          account_type: string
          agency_code: string | null
          bank_code: string | null
          bank_name: string | null
          color: string | null
          created_at: string
          id: string
          informed_balance: number | null
          informed_balance_date: string | null
          initial_balance: number
          is_default: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_digit?: string | null
          account_number?: string | null
          account_type?: string
          agency_code?: string | null
          bank_code?: string | null
          bank_name?: string | null
          color?: string | null
          created_at?: string
          id?: string
          informed_balance?: number | null
          informed_balance_date?: string | null
          initial_balance?: number
          is_default?: boolean
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_digit?: string | null
          account_number?: string | null
          account_type?: string
          agency_code?: string | null
          bank_code?: string | null
          bank_name?: string | null
          color?: string | null
          created_at?: string
          id?: string
          informed_balance?: number | null
          informed_balance_date?: string | null
          initial_balance?: number
          is_default?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      financial_record_attachments: {
        Row: {
          created_at: string
          display_name: string | null
          file_name: string
          file_size: number
          file_type: string
          file_url: string
          id: string
          position: number
          record_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          file_name: string
          file_size?: number
          file_type?: string
          file_url: string
          id?: string
          position?: number
          record_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          file_name?: string
          file_size?: number
          file_type?: string
          file_url?: string
          id?: string
          position?: number
          record_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_record_attachments_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "financial_records"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_records: {
        Row: {
          account_id: string | null
          amount: number
          attachment_name: string | null
          attachment_url: string | null
          category: string
          created_at: string
          description: string
          discount_amount: number | null
          due_date: string | null
          entry_date: string
          id: string
          installment_group_id: string | null
          installment_number: number | null
          installment_total: number | null
          interest_amount: number | null
          is_recurring: boolean
          notes: string | null
          payee: string | null
          payment_date: string | null
          payment_method: string | null
          recurring_active: boolean
          referente: string | null
          status: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          amount?: number
          attachment_name?: string | null
          attachment_url?: string | null
          category?: string
          created_at?: string
          description: string
          discount_amount?: number | null
          due_date?: string | null
          entry_date?: string
          id?: string
          installment_group_id?: string | null
          installment_number?: number | null
          installment_total?: number | null
          interest_amount?: number | null
          is_recurring?: boolean
          notes?: string | null
          payee?: string | null
          payment_date?: string | null
          payment_method?: string | null
          recurring_active?: boolean
          referente?: string | null
          status?: string
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          attachment_name?: string | null
          attachment_url?: string | null
          category?: string
          created_at?: string
          description?: string
          discount_amount?: number | null
          due_date?: string | null
          entry_date?: string
          id?: string
          installment_group_id?: string | null
          installment_number?: number | null
          installment_total?: number | null
          interest_amount?: number | null
          is_recurring?: boolean
          notes?: string | null
          payee?: string | null
          payment_date?: string | null
          payment_method?: string | null
          recurring_active?: boolean
          referente?: string | null
          status?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_records_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      global_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      group_members: {
        Row: {
          group_id: string
          id: string
          joined_at: string
          role: Database["public"]["Enums"]["group_role"]
          user_id: string
        }
        Insert: {
          group_id: string
          id?: string
          joined_at?: string
          role?: Database["public"]["Enums"]["group_role"]
          user_id: string
        }
        Update: {
          group_id?: string
          id?: string
          joined_at?: string
          role?: Database["public"]["Enums"]["group_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_messages: {
        Row: {
          audio_url: string | null
          content: string
          created_at: string
          edited_at: string | null
          group_id: string
          id: string
          image_url: string | null
          reply_to_id: string | null
          user_id: string
          video_url: string | null
        }
        Insert: {
          audio_url?: string | null
          content?: string
          created_at?: string
          edited_at?: string | null
          group_id: string
          id?: string
          image_url?: string | null
          reply_to_id?: string | null
          user_id: string
          video_url?: string | null
        }
        Update: {
          audio_url?: string | null
          content?: string
          created_at?: string
          edited_at?: string | null
          group_id?: string
          id?: string
          image_url?: string | null
          reply_to_id?: string | null
          user_id?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "group_messages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "group_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      group_read_receipts: {
        Row: {
          group_id: string
          id: string
          last_read_at: string
          user_id: string
        }
        Insert: {
          group_id: string
          id?: string
          last_read_at?: string
          user_id: string
        }
        Update: {
          group_id?: string
          id?: string
          last_read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_read_receipts_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          avatar_url: string | null
          city_id: string
          created_at: string
          created_by: string
          description: string | null
          id: string
          invite_code: string
          is_public: boolean
          max_members: number
          name: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          city_id: string
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          invite_code?: string
          is_public?: boolean
          max_members?: number
          name: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          city_id?: string
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          invite_code?: string
          is_public?: boolean
          max_members?: number
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          id: string
          invite_code: string
          invited_user_id: string | null
          inviter_id: string
          status: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          id?: string
          invite_code: string
          invited_user_id?: string | null
          inviter_id: string
          status?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          id?: string
          invite_code?: string
          invited_user_id?: string | null
          inviter_id?: string
          status?: string
        }
        Relationships: []
      }
      manual_contacts: {
        Row: {
          created_at: string
          id: string
          name: string
          notes: string | null
          phone: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          user_id?: string
        }
        Relationships: []
      }
      medication_logs: {
        Row: {
          created_at: string
          id: string
          log_date: string
          medication_id: string
          scheduled_time: string | null
          taken_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          log_date?: string
          medication_id: string
          scheduled_time?: string | null
          taken_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          log_date?: string
          medication_id?: string
          scheduled_time?: string | null
          taken_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "medication_logs_medication_id_fkey"
            columns: ["medication_id"]
            isOneToOne: false
            referencedRelation: "medications"
            referencedColumns: ["id"]
          },
        ]
      }
      medications: {
        Row: {
          concentration: string | null
          created_at: string
          doctor_id: string | null
          duration_days: number | null
          duration_type: string
          frequency: string
          generic_name: string | null
          icon: string | null
          id: string
          instructions: string | null
          name: string
          notes: string | null
          pharmaceutical_form: string | null
          schedule_time: string
          start_date: string
          suspended: boolean
          suspended_at: string | null
          updated_at: string
          user_id: string
          weekdays: Json | null
        }
        Insert: {
          concentration?: string | null
          created_at?: string
          doctor_id?: string | null
          duration_days?: number | null
          duration_type?: string
          frequency: string
          generic_name?: string | null
          icon?: string | null
          id?: string
          instructions?: string | null
          name: string
          notes?: string | null
          pharmaceutical_form?: string | null
          schedule_time: string
          start_date: string
          suspended?: boolean
          suspended_at?: string | null
          updated_at?: string
          user_id: string
          weekdays?: Json | null
        }
        Update: {
          concentration?: string | null
          created_at?: string
          doctor_id?: string | null
          duration_days?: number | null
          duration_type?: string
          frequency?: string
          generic_name?: string | null
          icon?: string | null
          id?: string
          instructions?: string | null
          name?: string
          notes?: string | null
          pharmaceutical_form?: string | null
          schedule_time?: string
          start_date?: string
          suspended?: boolean
          suspended_at?: string | null
          updated_at?: string
          user_id?: string
          weekdays?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "medications_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          message_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          message_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          message_type?: string
          user_id?: string
        }
        Relationships: []
      }
      news_cache: {
        Row: {
          city_name: string
          created_at: string
          id: string
          news: Json
          state_name: string
        }
        Insert: {
          city_name: string
          created_at?: string
          id?: string
          news?: Json
          state_name?: string
        }
        Update: {
          city_name?: string
          created_at?: string
          id?: string
          news?: Json
          state_name?: string
        }
        Relationships: []
      }
      notebook_notes: {
        Row: {
          content: string
          created_at: string
          id: string
          notebook_id: string
          pinned: boolean
          position: number
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          notebook_id: string
          pinned?: boolean
          position?: number
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          notebook_id?: string
          pinned?: boolean
          position?: number
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notebook_notes_notebook_id_fkey"
            columns: ["notebook_id"]
            isOneToOne: false
            referencedRelation: "notebooks"
            referencedColumns: ["id"]
          },
        ]
      }
      notebooks: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          position: number
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          position?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          position?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          actor_id: string
          created_at: string
          emoji: string | null
          id: string
          post_id: string | null
          read: boolean
          type: string
          user_id: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          emoji?: string | null
          id?: string
          post_id?: string | null
          read?: boolean
          type: string
          user_id: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          emoji?: string | null
          id?: string
          post_id?: string | null
          read?: boolean
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      places_cache: {
        Row: {
          category: string
          citations: Json
          city_name: string
          created_at: string
          id: string
          places: Json
        }
        Insert: {
          category: string
          citations?: Json
          city_name: string
          created_at?: string
          id?: string
          places?: Json
        }
        Update: {
          category?: string
          citations?: Json
          city_name?: string
          created_at?: string
          id?: string
          places?: Json
        }
        Relationships: []
      }
      poll_options: {
        Row: {
          created_at: string
          id: string
          position: number
          post_id: string
          text: string
        }
        Insert: {
          created_at?: string
          id?: string
          position?: number
          post_id: string
          text: string
        }
        Update: {
          created_at?: string
          id?: string
          position?: number
          post_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "poll_options_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_votes: {
        Row: {
          created_at: string
          id: string
          option_id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          option_id: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          option_id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "poll_votes_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "poll_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_votes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_likes: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_reactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_reports: {
        Row: {
          created_at: string
          id: string
          post_id: string
          reason: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          reason: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          reason?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_reports_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_reposts: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_reposts_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_reposts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "post_reposts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      post_views: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_views_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          city_id: string
          content: string
          created_at: string
          id: string
          image_url: string | null
          parent_id: string | null
          user_id: string
          video_url: string | null
        }
        Insert: {
          city_id: string
          content?: string
          created_at?: string
          id?: string
          image_url?: string | null
          parent_id?: string | null
          user_id: string
          video_url?: string | null
        }
        Update: {
          city_id?: string
          content?: string
          created_at?: string
          id?: string
          image_url?: string | null
          parent_id?: string | null
          user_id?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      profiles: {
        Row: {
          active_tab: string | null
          address: string | null
          agenda_view_mode: string | null
          avatar_url: string | null
          backup_frequency: string | null
          created_at: string
          display_name: string
          favorite_city: string | null
          font_size: number | null
          full_name: string | null
          id: string
          last_backup_at: string | null
          last_seen_at: string | null
          map_dark_mode: string | null
          phone: string | null
          referral_code: string | null
          sync_enabled: boolean
          tab_order: Json | null
          theme: string | null
          updated_at: string
          user_id: string
          visible_fields: Json | null
          visible_tabs: Json | null
        }
        Insert: {
          active_tab?: string | null
          address?: string | null
          agenda_view_mode?: string | null
          avatar_url?: string | null
          backup_frequency?: string | null
          created_at?: string
          display_name?: string
          favorite_city?: string | null
          font_size?: number | null
          full_name?: string | null
          id?: string
          last_backup_at?: string | null
          last_seen_at?: string | null
          map_dark_mode?: string | null
          phone?: string | null
          referral_code?: string | null
          sync_enabled?: boolean
          tab_order?: Json | null
          theme?: string | null
          updated_at?: string
          user_id: string
          visible_fields?: Json | null
          visible_tabs?: Json | null
        }
        Update: {
          active_tab?: string | null
          address?: string | null
          agenda_view_mode?: string | null
          avatar_url?: string | null
          backup_frequency?: string | null
          created_at?: string
          display_name?: string
          favorite_city?: string | null
          font_size?: number | null
          full_name?: string | null
          id?: string
          last_backup_at?: string | null
          last_seen_at?: string | null
          map_dark_mode?: string | null
          phone?: string | null
          referral_code?: string | null
          sync_enabled?: boolean
          tab_order?: Json | null
          theme?: string | null
          updated_at?: string
          user_id?: string
          visible_fields?: Json | null
          visible_tabs?: Json | null
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          created_at: string
          endpoint: string
          id: string
          request_count: number
          user_id: string | null
          window_start: string
        }
        Insert: {
          created_at?: string
          endpoint: string
          id?: string
          request_count?: number
          user_id?: string | null
          window_start?: string
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: string
          request_count?: number
          user_id?: string | null
          window_start?: string
        }
        Relationships: []
      }
      saved_addresses: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          id: string
          label: string
          mobile: string | null
          name: string | null
          neighborhood: string | null
          number: string | null
          phone: string | null
          user_id: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          id?: string
          label: string
          mobile?: string | null
          name?: string | null
          neighborhood?: string | null
          number?: string | null
          phone?: string | null
          user_id: string
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          id?: string
          label?: string
          mobile?: string | null
          name?: string | null
          neighborhood?: string | null
          number?: string | null
          phone?: string | null
          user_id?: string
        }
        Relationships: []
      }
      saved_words: {
        Row: {
          created_at: string
          definition: string | null
          extra_data: Json | null
          id: string
          user_id: string
          word: string
        }
        Insert: {
          created_at?: string
          definition?: string | null
          extra_data?: Json | null
          id?: string
          user_id: string
          word: string
        }
        Update: {
          created_at?: string
          definition?: string | null
          extra_data?: Json | null
          id?: string
          user_id?: string
          word?: string
        }
        Relationships: []
      }
      shopping_items: {
        Row: {
          category: string | null
          created_at: string
          estimated_value: number | null
          id: string
          list_id: string
          name: string
          position: number
          purchased: boolean
          quantity: number | null
          unit: string | null
          user_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          estimated_value?: number | null
          id?: string
          list_id: string
          name: string
          position?: number
          purchased?: boolean
          quantity?: number | null
          unit?: string | null
          user_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          estimated_value?: number | null
          id?: string
          list_id?: string
          name?: string
          position?: number
          purchased?: boolean
          quantity?: number | null
          unit?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "shopping_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_lists: {
        Row: {
          created_at: string
          id: string
          list_date: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          list_date?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          list_date?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      traffic_alerts: {
        Row: {
          alert_type: string
          city_id: string
          created_at: string
          description: string | null
          downvotes: number
          expires_at: string
          id: string
          latitude: number
          longitude: number
          upvotes: number
          user_id: string
        }
        Insert: {
          alert_type: string
          city_id: string
          created_at?: string
          description?: string | null
          downvotes?: number
          expires_at?: string
          id?: string
          latitude: number
          longitude: number
          upvotes?: number
          user_id: string
        }
        Update: {
          alert_type?: string
          city_id?: string
          created_at?: string
          description?: string | null
          downvotes?: number
          expires_at?: string
          id?: string
          latitude?: number
          longitude?: number
          upvotes?: number
          user_id?: string
        }
        Relationships: []
      }
      translation_cache: {
        Row: {
          created_at: string
          id: string
          source_hash: string
          source_text: string
          target_lang: string
          translated_text: string
        }
        Insert: {
          created_at?: string
          id?: string
          source_hash: string
          source_text: string
          target_lang: string
          translated_text: string
        }
        Update: {
          created_at?: string
          id?: string
          source_hash?: string
          source_text?: string
          target_lang?: string
          translated_text?: string
        }
        Relationships: []
      }
      user_bans: {
        Row: {
          active: boolean
          banned_by: string
          created_at: string
          expires_at: string | null
          id: string
          reason: string
          user_id: string
        }
        Insert: {
          active?: boolean
          banned_by: string
          created_at?: string
          expires_at?: string | null
          id?: string
          reason: string
          user_id: string
        }
        Update: {
          active?: boolean
          banned_by?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          reason?: string
          user_id?: string
        }
        Relationships: []
      }
      user_custom_options: {
        Row: {
          created_at: string
          id: string
          option_type: string
          user_id: string
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          option_type: string
          user_id: string
          value: string
        }
        Update: {
          created_at?: string
          id?: string
          option_type?: string
          user_id?: string
          value?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      public_banners: {
        Row: {
          active: boolean | null
          city_id: string | null
          created_at: string | null
          id: string | null
          link_url: string | null
          logo_url: string | null
          position: number | null
          text: string | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          city_id?: string | null
          created_at?: string | null
          id?: string | null
          link_url?: string | null
          logo_url?: string | null
          position?: number | null
          text?: string | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          city_id?: string | null
          created_at?: string | null
          id?: string | null
          link_url?: string | null
          logo_url?: string | null
          position?: number | null
          text?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      public_profiles: {
        Row: {
          avatar_url: string | null
          display_name: string | null
          full_name: string | null
          last_seen_at: string | null
          referral_code: string | null
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          display_name?: string | null
          full_name?: string | null
          last_seen_at?: string | null
          referral_code?: string | null
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          display_name?: string | null
          full_name?: string | null
          last_seen_at?: string | null
          referral_code?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      check_rate_limit: {
        Args: {
          p_endpoint: string
          p_max_requests?: number
          p_user_id: string
          p_window_seconds?: number
        }
        Returns: boolean
      }
      cleanup_old_logs: { Args: never; Returns: undefined }
      get_contact_phone: { Args: { target_user_id: string }; Returns: string }
      get_public_phone: { Args: { target_user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_group_admin: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      is_group_member: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      is_owner: { Args: { row_user_id: string }; Returns: boolean }
      is_user_banned: { Args: { _user_id: string }; Returns: boolean }
      log_access: {
        Args: {
          p_action: string
          p_ip_address?: string
          p_metadata?: Json
          p_resource_id?: string
          p_resource_type: string
          p_user_agent?: string
          p_user_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "user"
      group_role: "admin" | "member"
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
      app_role: ["admin", "user"],
      group_role: ["admin", "member"],
    },
  },
} as const
