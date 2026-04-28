ALTER TABLE public.search_results
  ADD COLUMN IF NOT EXISTS enriched_data jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS enriched_at timestamptz,
  ADD COLUMN IF NOT EXISTS enriched_source text;

DROP POLICY IF EXISTS "Service role can update results" ON public.search_results;
CREATE POLICY "Service role can update results"
ON public.search_results
FOR UPDATE
USING ((current_setting('request.jwt.claims', true)::json ->> 'role') = 'service_role')
WITH CHECK ((current_setting('request.jwt.claims', true)::json ->> 'role') = 'service_role');