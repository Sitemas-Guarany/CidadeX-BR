
-- Poll options linked to a post
CREATE TABLE public.poll_options (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.poll_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read poll options" ON public.poll_options FOR SELECT USING (true);
CREATE POLICY "Authenticated can create poll options" ON public.poll_options FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Owner can delete poll options" ON public.poll_options FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.posts WHERE posts.id = poll_options.post_id AND posts.user_id = auth.uid())
);

CREATE INDEX idx_poll_options_post_id ON public.poll_options(post_id);

-- Poll votes (one vote per user per post)
CREATE TABLE public.poll_votes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  option_id UUID NOT NULL REFERENCES public.poll_options(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(post_id, user_id)
);

ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read poll votes" ON public.poll_votes FOR SELECT USING (true);
CREATE POLICY "Authenticated can vote" ON public.poll_votes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can change vote" ON public.poll_votes FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_poll_votes_post_id ON public.poll_votes(post_id);
CREATE INDEX idx_poll_votes_option_id ON public.poll_votes(option_id);
