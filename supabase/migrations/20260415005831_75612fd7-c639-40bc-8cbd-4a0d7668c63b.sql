
CREATE TABLE public.st_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data jsonb NOT NULL DEFAULT '[]'::jsonb,
  file_name text NOT NULL DEFAULT '',
  row_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.st_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all read access" ON public.st_data FOR SELECT USING (true);
CREATE POLICY "Allow all insert access" ON public.st_data FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all delete access" ON public.st_data FOR DELETE USING (true);
