
-- Table for scrolling banner/ad legends
CREATE TABLE public.banner_legends (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  text TEXT NOT NULL,
  city_id TEXT,  -- null = all cities
  active BOOLEAN NOT NULL DEFAULT true,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.banner_legends ENABLE ROW LEVEL SECURITY;

-- Anyone can read active banners
CREATE POLICY "Anyone can read active banners"
  ON public.banner_legends FOR SELECT
  USING (active = true);

-- Authenticated users can manage banners
CREATE POLICY "Authenticated can insert banners"
  ON public.banner_legends FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = created_by);

CREATE POLICY "Creator can update banners"
  ON public.banner_legends FOR UPDATE
  USING (auth.uid() = created_by);

CREATE POLICY "Creator can delete banners"
  ON public.banner_legends FOR DELETE
  USING (auth.uid() = created_by);

-- Trigger for updated_at
CREATE TRIGGER update_banner_legends_updated_at
  BEFORE UPDATE ON public.banner_legends
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
