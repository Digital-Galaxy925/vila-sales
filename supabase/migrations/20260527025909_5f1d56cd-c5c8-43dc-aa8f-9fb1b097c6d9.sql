CREATE TABLE public.propostas_simulador (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo_produto TEXT NOT NULL DEFAULT '',
  descricao_produto TEXT NOT NULL DEFAULT '',
  filial TEXT NOT NULL DEFAULT '',
  filial_nome TEXT NOT NULL DEFAULT '',
  volume_caixas NUMERIC,
  unid_por_caixa NUMERIC,
  total_unidades NUMERIC,
  custo_unitario NUMERIC,
  preco_venda NUMERIC,
  margem_real NUMERIC,
  margem_minima NUMERIC,
  total_sellout NUMERIC,
  investimento_por_unidade NUMERIC,
  investimento_por_caixa NUMERIC,
  investimento_total NUMERIC,
  percentual_investimento NUMERIC,
  observacao TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.propostas_simulador TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.propostas_simulador TO authenticated;
GRANT ALL ON public.propostas_simulador TO service_role;

ALTER TABLE public.propostas_simulador ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all read access" ON public.propostas_simulador FOR SELECT USING (true);
CREATE POLICY "Allow all insert access" ON public.propostas_simulador FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update access" ON public.propostas_simulador FOR UPDATE USING (true);
CREATE POLICY "Allow all delete access" ON public.propostas_simulador FOR DELETE USING (true);

CREATE TRIGGER update_propostas_simulador_updated_at
BEFORE UPDATE ON public.propostas_simulador
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();