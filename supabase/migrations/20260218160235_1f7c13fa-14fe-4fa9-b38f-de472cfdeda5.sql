
CREATE TABLE public.events_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  city_name TEXT NOT NULL,
  events JSONB NOT NULL DEFAULT '[]'::jsonb,
  citations JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT events_cache_city_unique UNIQUE (city_name)
);

ALTER TABLE public.events_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Events cache is readable by everyone"
ON public.events_cache FOR SELECT USING (true);

CREATE POLICY "Service role can manage events cache"
ON public.events_cache FOR ALL USING (true) WITH CHECK (true);
