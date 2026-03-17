
DROP VIEW IF EXISTS public.public_profiles;

CREATE VIEW public.public_profiles AS
SELECT
  user_id,
  display_name,
  full_name,
  avatar_url,
  referral_code,
  last_seen_at
FROM public.profiles;
