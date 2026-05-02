-- Tabela para armazenar dados dos livros processados por filial
CREATE TABLE public.livros_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  filial TEXT NOT NULL UNIQUE,
  data_upload TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  produtos JSONB NOT NULL DEFAULT '[]'::jsonb,
  file_name TEXT NOT NULL DEFAULT ''::text,
  row_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilita RLS
ALTER TABLE public.livros_data ENABLE ROW LEVEL SECURITY;

-- Políticas abertas (dados compartilhados, sem auth) — mesmo padrão do st_data
CREATE POLICY "Allow all read access"
  ON public.livros_data FOR SELECT
  USING (true);

CREATE POLICY "Allow all insert access"
  ON public.livros_data FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow all update access"
  ON public.livros_data FOR UPDATE
  USING (true);

CREATE POLICY "Allow all delete access"
  ON public.livros_data FOR DELETE
  USING (true);

-- Trigger para manter updated_at
CREATE TRIGGER update_livros_data_updated_at
BEFORE UPDATE ON public.livros_data
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Índice por filial para lookup rápido
CREATE INDEX idx_livros_data_filial ON public.livros_data(filial);