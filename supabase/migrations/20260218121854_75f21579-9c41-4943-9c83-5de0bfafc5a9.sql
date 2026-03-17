
-- Reposts table
CREATE TABLE public.post_reposts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(post_id, user_id)
);

ALTER TABLE public.post_reposts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read reposts" ON public.post_reposts FOR SELECT USING (true);
CREATE POLICY "Authenticated can repost" ON public.post_reposts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unrepost" ON public.post_reposts FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_reposts_post ON public.post_reposts(post_id);
CREATE INDEX idx_reposts_user ON public.post_reposts(user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.post_reposts;
