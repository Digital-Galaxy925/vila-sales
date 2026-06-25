GRANT SELECT, INSERT, UPDATE, DELETE ON public.livros_data TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.livros_data TO authenticated;
GRANT ALL ON public.livros_data TO service_role;