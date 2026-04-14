
CREATE TABLE public.lancamentos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('debito', 'credito')),
  bu TEXT NOT NULL DEFAULT '',
  negociacao TEXT NOT NULL DEFAULT '',
  competencia TEXT NOT NULL DEFAULT '',
  volume NUMERIC,
  valor_pedido NUMERIC,
  data_aprovacao DATE,
  valor_unit NUMERIC,
  investimento_total NUMERIC,
  perc_investimento NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.lancamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all read access" ON public.lancamentos FOR SELECT USING (true);
CREATE POLICY "Allow all insert access" ON public.lancamentos FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update access" ON public.lancamentos FOR UPDATE USING (true);
CREATE POLICY "Allow all delete access" ON public.lancamentos FOR DELETE USING (true);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_lancamentos_updated_at
  BEFORE UPDATE ON public.lancamentos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
