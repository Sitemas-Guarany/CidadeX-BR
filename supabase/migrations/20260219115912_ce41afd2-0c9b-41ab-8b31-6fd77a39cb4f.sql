
-- Recreate the public_profiles view to include last_seen_at
CREATE OR REPLACE VIEW public.public_profiles AS
SELECT 
  user_id,
  display_name,
  avatar_url,
  referral_code,
  last_seen_at
FROM public.profiles;
