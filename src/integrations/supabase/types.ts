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
      lancamentos: {
        Row: {
          bu: string
          competencia: string
          created_at: string
          data_aprovacao: string | null
          id: string
          investimento_total: number | null
          negociacao: string
          perc_investimento: number | null
          tipo: string
          updated_at: string
          valor_pedido: number | null
          valor_unit: number | null
          volume: number | null
        }
        Insert: {
          bu?: string
          competencia?: string
          created_at?: string
          data_aprovacao?: string | null
          id?: string
          investimento_total?: number | null
          negociacao?: string
          perc_investimento?: number | null
          tipo: string
          updated_at?: string
          valor_pedido?: number | null
          valor_unit?: number | null
          volume?: number | null
        }
        Update: {
          bu?: string
          competencia?: string
          created_at?: string
          data_aprovacao?: string | null
          id?: string
          investimento_total?: number | null
          negociacao?: string
          perc_investimento?: number | null
          tipo?: string
          updated_at?: string
          valor_pedido?: number | null
          valor_unit?: number | null
          volume?: number | null
        }
        Relationships: []
      }
      livros_data: {
        Row: {
          created_at: string
          data_upload: string
          file_name: string
          filial: string
          id: string
          produtos: Json
          row_count: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          data_upload?: string
          file_name?: string
          filial: string
          id?: string
          produtos?: Json
          row_count?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          data_upload?: string
          file_name?: string
          filial?: string
          id?: string
          produtos?: Json
          row_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      propostas_aprovadas: {
        Row: {
          bu: string
          created_at: string
          data_analise: string
          id: string
          maior_pedido: string | null
          margem_ponderada: number | null
          margem_total_rs: number | null
          nome_gerente: string
          observacao: string | null
          pdf_path: string | null
          pedidos: Json | null
          produtos: Json | null
          updated_at: string
          volume_total_vendas: number | null
        }
        Insert: {
          bu?: string
          created_at?: string
          data_analise?: string
          id?: string
          maior_pedido?: string | null
          margem_ponderada?: number | null
          margem_total_rs?: number | null
          nome_gerente?: string
          observacao?: string | null
          pdf_path?: string | null
          pedidos?: Json | null
          produtos?: Json | null
          updated_at?: string
          volume_total_vendas?: number | null
        }
        Update: {
          bu?: string
          created_at?: string
          data_analise?: string
          id?: string
          maior_pedido?: string | null
          margem_ponderada?: number | null
          margem_total_rs?: number | null
          nome_gerente?: string
          observacao?: string | null
          pdf_path?: string | null
          pedidos?: Json | null
          produtos?: Json | null
          updated_at?: string
          volume_total_vendas?: number | null
        }
        Relationships: []
      }
      propostas_simulador: {
        Row: {
          codigo_produto: string
          created_at: string
          custo_unitario: number | null
          descricao_produto: string
          filial: string
          filial_nome: string
          id: string
          investimento_por_caixa: number | null
          investimento_por_unidade: number | null
          investimento_total: number | null
          margem_minima: number | null
          margem_real: number | null
          observacao: string | null
          percentual_investimento: number | null
          preco_venda: number | null
          total_sellout: number | null
          total_unidades: number | null
          unid_por_caixa: number | null
          updated_at: string
          volume_caixas: number | null
        }
        Insert: {
          codigo_produto?: string
          created_at?: string
          custo_unitario?: number | null
          descricao_produto?: string
          filial?: string
          filial_nome?: string
          id?: string
          investimento_por_caixa?: number | null
          investimento_por_unidade?: number | null
          investimento_total?: number | null
          margem_minima?: number | null
          margem_real?: number | null
          observacao?: string | null
          percentual_investimento?: number | null
          preco_venda?: number | null
          total_sellout?: number | null
          total_unidades?: number | null
          unid_por_caixa?: number | null
          updated_at?: string
          volume_caixas?: number | null
        }
        Update: {
          codigo_produto?: string
          created_at?: string
          custo_unitario?: number | null
          descricao_produto?: string
          filial?: string
          filial_nome?: string
          id?: string
          investimento_por_caixa?: number | null
          investimento_por_unidade?: number | null
          investimento_total?: number | null
          margem_minima?: number | null
          margem_real?: number | null
          observacao?: string | null
          percentual_investimento?: number | null
          preco_venda?: number | null
          total_sellout?: number | null
          total_unidades?: number | null
          unid_por_caixa?: number | null
          updated_at?: string
          volume_caixas?: number | null
        }
        Relationships: []
      }
      st_data: {
        Row: {
          created_at: string
          data: Json
          file_name: string
          id: string
          row_count: number
        }
        Insert: {
          created_at?: string
          data?: Json
          file_name?: string
          id?: string
          row_count?: number
        }
        Update: {
          created_at?: string
          data?: Json
          file_name?: string
          id?: string
          row_count?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
