-- Adicionar coluna neighborhood na tabela searches
ALTER TABLE public.searches ADD COLUMN IF NOT EXISTS neighborhood TEXT;