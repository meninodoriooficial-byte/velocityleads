ALTER TABLE public.search_results ADD COLUMN IF NOT EXISTS source_api text;
CREATE INDEX IF NOT EXISTS idx_search_results_source_api ON public.search_results(source_api);