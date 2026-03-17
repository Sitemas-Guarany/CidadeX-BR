
CREATE TABLE public.translation_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_hash text NOT NULL,
  target_lang text NOT NULL,
  source_text text NOT NULL,
  translated_text text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT unique_translation UNIQUE (source_hash, target_lang)
);

CREATE INDEX idx_translation_cache_lookup ON public.translation_cache (source_hash, target_lang);

ALTER TABLE public.translation_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read translations"
ON public.translation_cache FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Service role can insert translations"
ON public.translation_cache FOR INSERT
WITH CHECK (true);
