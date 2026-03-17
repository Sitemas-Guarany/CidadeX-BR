
-- Create user_bans table
CREATE TABLE public.user_bans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  banned_by UUID NOT NULL,
  reason TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  active BOOLEAN NOT NULL DEFAULT true
);

-- Enable RLS
ALTER TABLE public.user_bans ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can read all bans"
  ON public.user_bans FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert bans"
  ON public.user_bans FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update bans"
  ON public.user_bans FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete bans"
  ON public.user_bans FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

-- Users can check if they are banned
CREATE POLICY "Users can read own bans"
  ON public.user_bans FOR SELECT
  USING (auth.uid() = user_id);

-- Function to check if user is banned
CREATE OR REPLACE FUNCTION public.is_user_banned(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_bans
    WHERE user_id = _user_id
      AND active = true
      AND (expires_at IS NULL OR expires_at > now())
  )
$$;
