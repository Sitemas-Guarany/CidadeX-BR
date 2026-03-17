
-- Add edited_at to group_messages
ALTER TABLE public.group_messages ADD COLUMN edited_at timestamp with time zone DEFAULT NULL;

-- Allow group members to update own messages (for editing)
CREATE POLICY "Users can update own group messages"
  ON public.group_messages FOR UPDATE
  USING (auth.uid() = user_id);

-- Add last_seen_at to profiles for online status
ALTER TABLE public.profiles ADD COLUMN last_seen_at timestamp with time zone DEFAULT NULL;
