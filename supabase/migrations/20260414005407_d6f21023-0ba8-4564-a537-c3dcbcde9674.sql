
-- Create table for approved proposals
CREATE TABLE public.propostas_aprovadas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome_gerente TEXT NOT NULL DEFAULT '',
  data_analise DATE NOT NULL DEFAULT CURRENT_DATE,
  bu TEXT NOT NULL DEFAULT '',
  observacao TEXT DEFAULT '',
  margem_ponderada NUMERIC,
  margem_total_rs NUMERIC,
  volume_total_vendas NUMERIC,
  maior_pedido TEXT DEFAULT '',
  produtos JSONB DEFAULT '[]'::jsonb,
  pedidos JSONB DEFAULT '[]'::jsonb,
  pdf_path TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.propostas_aprovadas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all read access" ON public.propostas_aprovadas FOR SELECT TO public USING (true);
CREATE POLICY "Allow all insert access" ON public.propostas_aprovadas FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Allow all update access" ON public.propostas_aprovadas FOR UPDATE TO public USING (true);
CREATE POLICY "Allow all delete access" ON public.propostas_aprovadas FOR DELETE TO public USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_propostas_aprovadas_updated_at
  BEFORE UPDATE ON public.propostas_aprovadas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for PDFs
INSERT INTO storage.buckets (id, name, public) VALUES ('propostas-pdfs', 'propostas-pdfs', true);

CREATE POLICY "Allow public read of PDFs" ON storage.objects FOR SELECT TO public USING (bucket_id = 'propostas-pdfs');
CREATE POLICY "Allow public upload of PDFs" ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = 'propostas-pdfs');
CREATE POLICY "Allow public delete of PDFs" ON storage.objects FOR DELETE TO public USING (bucket_id = 'propostas-pdfs');
