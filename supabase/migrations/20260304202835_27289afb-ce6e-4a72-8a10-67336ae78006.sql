
-- Create saved_words table
CREATE TABLE public.saved_words (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  word text NOT NULL,
  definition text,
  extra_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, word)
);

-- Enable RLS
ALTER TABLE public.saved_words ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can read own saved words" ON public.saved_words
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own saved words" ON public.saved_words
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own saved words" ON public.saved_words
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Limit trigger: max 500 words per user
CREATE OR REPLACE FUNCTION public.limit_saved_words()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE cnt INTEGER;
BEGIN
  SELECT COUNT(*) INTO cnt FROM public.saved_words WHERE user_id = NEW.user_id;
  IF cnt >= 500 THEN RAISE EXCEPTION 'Limite máximo de 500 palavras salvas atingido.'; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER check_saved_words_limit
  BEFORE INSERT ON public.saved_words
  FOR EACH ROW EXECUTE FUNCTION public.limit_saved_words();
