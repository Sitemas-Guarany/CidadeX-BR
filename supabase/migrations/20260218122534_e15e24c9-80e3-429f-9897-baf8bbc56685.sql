
-- Post views table
CREATE TABLE public.post_views (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(post_id, user_id)
);

ALTER TABLE public.post_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read views" ON public.post_views FOR SELECT USING (true);
CREATE POLICY "Authenticated can register view" ON public.post_views FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_views_post ON public.post_views(post_id);
