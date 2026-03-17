
-- Direct messages between contacts
CREATE TABLE public.direct_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL,
  receiver_id UUID NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  read_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

-- Policies: only sender and receiver can see their messages
CREATE POLICY "Users can read own DMs"
  ON public.direct_messages FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Users can send DMs"
  ON public.direct_messages FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Users can delete own sent DMs"
  ON public.direct_messages FOR DELETE
  USING (auth.uid() = sender_id);

-- Allow marking messages as read
CREATE POLICY "Receiver can update read status"
  ON public.direct_messages FOR UPDATE
  USING (auth.uid() = receiver_id);

-- Index for fast lookups
CREATE INDEX idx_dm_participants ON public.direct_messages (sender_id, receiver_id, created_at DESC);
CREATE INDEX idx_dm_receiver ON public.direct_messages (receiver_id, created_at DESC);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;
