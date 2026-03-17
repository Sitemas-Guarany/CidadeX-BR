
-- Allow all authenticated users to read inviter_id for ranking purposes
CREATE POLICY "Authenticated can read invite counts"
ON public.invites FOR SELECT
TO authenticated
USING (true);

-- Drop the old restrictive policy
DROP POLICY IF EXISTS "Users can read own invites" ON public.invites;
