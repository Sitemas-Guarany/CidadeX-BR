
-- Create contacts table for friend/contact relationships
CREATE TABLE public.contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  contact_user_id UUID NOT NULL,
  nickname TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, contact_user_id)
);

-- Enable RLS
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

-- Users can read own contacts
CREATE POLICY "Users can read own contacts"
ON public.contacts FOR SELECT
USING (auth.uid() = user_id);

-- Users can add contacts
CREATE POLICY "Users can add contacts"
ON public.contacts FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can remove contacts
CREATE POLICY "Users can delete own contacts"
ON public.contacts FOR DELETE
USING (auth.uid() = user_id);

-- Users can update own contacts (nickname)
CREATE POLICY "Users can update own contacts"
ON public.contacts FOR UPDATE
USING (auth.uid() = user_id);
