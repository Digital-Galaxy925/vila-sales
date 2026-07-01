
CREATE TABLE public.cotas_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo TEXT,
  mes_ano TEXT,
  volume NUMERIC,
  dados JSONB NOT NULL DEFAULT '{}'::jsonb,
  file_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cotas_data TO anon, authenticated;
GRANT ALL ON public.cotas_data TO service_role;

ALTER TABLE public.cotas_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read cotas_data" ON public.cotas_data FOR SELECT USING (true);
CREATE POLICY "Public insert cotas_data" ON public.cotas_data FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update cotas_data" ON public.cotas_data FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete cotas_data" ON public.cotas_data FOR DELETE USING (true);

CREATE INDEX idx_cotas_data_codigo_mes ON public.cotas_data (codigo, mes_ano);

CREATE TRIGGER update_cotas_data_updated_at
BEFORE UPDATE ON public.cotas_data
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
