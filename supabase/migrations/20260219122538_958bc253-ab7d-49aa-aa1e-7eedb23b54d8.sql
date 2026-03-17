
-- Create post_reports table for content moderation
CREATE TABLE public.post_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(post_id, user_id)
);

-- Enable RLS
ALTER TABLE public.post_reports ENABLE ROW LEVEL SECURITY;

-- Users can create their own reports
CREATE POLICY "Users can report posts"
  ON public.post_reports FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can see their own reports (to know they already reported)
CREATE POLICY "Users can see own reports"
  ON public.post_reports FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Admins can see all reports
CREATE POLICY "Admins can see all reports"
  ON public.post_reports FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Admins can delete reports (dismiss)
CREATE POLICY "Admins can delete reports"
  ON public.post_reports FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Users can delete own reports (undo)
CREATE POLICY "Users can delete own reports"
  ON public.post_reports FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
