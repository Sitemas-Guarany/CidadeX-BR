
-- Remove overly permissive INSERT policy on translation_cache
-- Service role bypasses RLS by default, so no explicit policy is needed for server-side inserts
DROP POLICY IF EXISTS "Service role can insert translations" ON public.translation_cache;
