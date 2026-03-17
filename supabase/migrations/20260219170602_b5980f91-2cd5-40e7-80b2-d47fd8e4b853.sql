
-- Create table for manual (non-registered) contacts
CREATE TABLE public.manual_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.manual_contacts ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can read own manual contacts"
  ON public.manual_contacts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own manual contacts"
  ON public.manual_contacts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own manual contacts"
  ON public.manual_contacts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own manual contacts"
  ON public.manual_contacts FOR DELETE
  USING (auth.uid() = user_id);

-- Limit to 50 manual contacts per user
CREATE OR REPLACE FUNCTION public.limit_manual_contacts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  contact_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO contact_count
  FROM public.manual_contacts
  WHERE user_id = NEW.user_id;

  IF contact_count >= 50 THEN
    RAISE EXCEPTION 'Limite máximo de 50 contatos manuais atingido.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER check_manual_contacts_limit
BEFORE INSERT ON public.manual_contacts
FOR EACH ROW
EXECUTE FUNCTION public.limit_manual_contacts();
