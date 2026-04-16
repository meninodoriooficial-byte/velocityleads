
-- Drop the overly permissive INSERT policy
DROP POLICY "Service role can insert results" ON public.search_results;

-- Create a more restrictive policy - only service role can insert
-- Edge functions use service role key, so this works for the web-search function
CREATE POLICY "Only service role can insert results"
  ON public.search_results FOR INSERT
  WITH CHECK (
    (SELECT current_setting('request.jwt.claims', true)::json->>'role') = 'service_role'
  );
