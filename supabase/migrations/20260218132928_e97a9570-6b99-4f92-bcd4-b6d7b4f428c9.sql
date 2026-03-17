
-- Create places cache table
CREATE TABLE public.places_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  city_name TEXT NOT NULL,
  category TEXT NOT NULL,
  places JSONB NOT NULL DEFAULT '[]'::jsonb,
  citations JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(city_name, category)
);

ALTER TABLE public.places_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read places cache" ON public.places_cache FOR SELECT USING (true);
