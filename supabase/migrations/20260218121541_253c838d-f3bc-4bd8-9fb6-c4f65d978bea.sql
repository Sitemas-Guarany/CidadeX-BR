
-- Reactions table (multiple emoji types per post)
CREATE TABLE public.post_reactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(post_id, user_id, emoji)
);

ALTER TABLE public.post_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read reactions" ON public.post_reactions FOR SELECT USING (true);
CREATE POLICY "Authenticated can react" ON public.post_reactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can remove reaction" ON public.post_reactions FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_reactions_post ON public.post_reactions(post_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.post_reactions;
