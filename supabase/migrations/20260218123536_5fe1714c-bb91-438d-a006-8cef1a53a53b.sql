
-- Replace overly permissive INSERT policy with a restricted one
-- Triggers use SECURITY DEFINER so they bypass RLS. We restrict direct inserts.
DROP POLICY "Authenticated can insert notifications" ON public.notifications;

CREATE POLICY "Only authenticated can insert own notifications"
ON public.notifications FOR INSERT
WITH CHECK (auth.uid() = actor_id);
