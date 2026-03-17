
-- Table for emoji reactions on messages (direct and group)
CREATE TABLE public.message_reactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  message_id uuid NOT NULL,
  message_type text NOT NULL CHECK (message_type IN ('direct', 'group')),
  emoji text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, message_id, emoji)
);

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read reactions"
  ON public.message_reactions FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can add reactions"
  ON public.message_reactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove own reactions"
  ON public.message_reactions FOR DELETE
  USING (auth.uid() = user_id);

-- Index for fast lookups
CREATE INDEX idx_message_reactions_message ON public.message_reactions(message_id, message_type);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
