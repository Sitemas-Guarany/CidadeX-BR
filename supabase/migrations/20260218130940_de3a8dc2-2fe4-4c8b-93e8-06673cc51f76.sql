
-- Cache de notícias geradas por IA
CREATE TABLE public.news_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city_name TEXT NOT NULL,
  state_name TEXT NOT NULL DEFAULT 'Ceará',
  news JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_news_cache_city_state ON public.news_cache(city_name, state_name);
CREATE INDEX idx_news_cache_created ON public.news_cache(created_at);

ALTER TABLE public.news_cache ENABLE ROW LEVEL SECURITY;

-- Leitura pública (notícias são conteúdo público)
CREATE POLICY "Anyone can read news cache"
ON public.news_cache FOR SELECT
USING (true);
