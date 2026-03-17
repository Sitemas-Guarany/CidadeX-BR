
-- 1. Drop the overly permissive SELECT policy
DROP POLICY IF EXISTS "Anyone authenticated can read profiles" ON public.profiles;

-- 2. Create restrictive SELECT policy: users can only read their OWN profile
CREATE POLICY "Users can read own profile"
ON public.profiles
FOR SELECT
USING (auth.uid() = user_id);

-- 3. Create a public_profiles view exposing ONLY non-sensitive data
-- security_invoker defaults to false, so the view runs as the owner (bypassing RLS on profiles)
CREATE OR REPLACE VIEW public.public_profiles AS
SELECT user_id, display_name, avatar_url, referral_code
FROM public.profiles;

-- 4. Grant access to the view for authenticated and anon roles
GRANT SELECT ON public.public_profiles TO authenticated;
GRANT SELECT ON public.public_profiles TO anon;
