
-- Enable RLS on the public_profiles view
ALTER VIEW public.public_profiles SET (security_invoker = on);

-- Add RLS policy: only authenticated users can read public profiles
CREATE POLICY "Authenticated can read public profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);
