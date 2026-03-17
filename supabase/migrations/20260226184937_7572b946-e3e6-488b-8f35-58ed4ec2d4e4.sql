-- Recreate public_profiles view WITHOUT security_invoker
-- The view itself acts as the security barrier by exposing only safe columns
-- (display_name, full_name, avatar_url, last_seen_at, referral_code, user_id)
DROP VIEW IF EXISTS public.public_profiles;

CREATE VIEW public.public_profiles AS
  SELECT
    user_id,
    display_name,
    full_name,
    avatar_url,
    last_seen_at,
    referral_code
  FROM public.profiles;

-- Grant SELECT to authenticated users only (not anon)
GRANT SELECT ON public.public_profiles TO authenticated;
REVOKE ALL ON public.public_profiles FROM anon;