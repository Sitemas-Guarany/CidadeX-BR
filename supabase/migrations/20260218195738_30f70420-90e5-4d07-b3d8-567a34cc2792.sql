-- 1. Fix public_profiles view: recreate as SECURITY INVOKER (default) instead of SECURITY DEFINER
DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles
WITH (security_invoker = true) AS
SELECT 
  user_id,
  display_name,
  avatar_url,
  referral_code
FROM public.profiles;

-- Grant access so authenticated and anon can read
GRANT SELECT ON public.public_profiles TO authenticated, anon;

-- 2. Fix banner_legends: hide created_by from public reads by restricting SELECT policy
-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Anyone can read active banners" ON public.banner_legends;

-- Create a new SELECT policy that excludes created_by via a secure view approach
-- Since we can't restrict columns via RLS, we create a public view without created_by
CREATE VIEW public.public_banners
WITH (security_invoker = true) AS
SELECT 
  id,
  text,
  link_url,
  logo_url,
  position,
  city_id,
  active,
  created_at,
  updated_at
FROM public.banner_legends
WHERE active = true;

GRANT SELECT ON public.public_banners TO authenticated, anon;

-- Re-add a restrictive policy: only authenticated users can read (to protect user IDs)
CREATE POLICY "Authenticated can read active banners"
ON public.banner_legends
FOR SELECT
USING (auth.uid() IS NOT NULL AND active = true);

-- Also allow creators to see their own (even inactive) banners
CREATE POLICY "Creators can read own banners"
ON public.banner_legends
FOR SELECT
USING (auth.uid() = created_by);