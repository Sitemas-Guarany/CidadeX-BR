
-- Table to store user-custom combo items (categories, professions, etc.)
CREATE TABLE public.user_custom_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  option_type text NOT NULL, -- 'category' or 'profession'
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, option_type, value)
);

ALTER TABLE public.user_custom_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own options"
  ON public.user_custom_options FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own options"
  ON public.user_custom_options FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own options"
  ON public.user_custom_options FOR DELETE
  USING (auth.uid() = user_id);
