
-- Revert: remove the overly permissive policy that exposes ALL profile columns
DROP POLICY IF EXISTS "Authenticated can read public profiles" ON public.profiles;

-- Revert security_invoker on public_profiles - it must remain SECURITY DEFINER
-- because the base table profiles has restrictive RLS (own profile only)
-- and the view intentionally exposes only safe columns to all authenticated users
ALTER VIEW public.public_profiles SET (security_invoker = off);
