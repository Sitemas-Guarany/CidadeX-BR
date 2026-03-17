
ALTER TABLE public.banner_legends ADD COLUMN logo_url TEXT;

-- Create storage bucket for banner logos
INSERT INTO storage.buckets (id, name, public) VALUES ('banner-logos', 'banner-logos', true);

-- Public read access
CREATE POLICY "Banner logos are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'banner-logos');

-- Authenticated users can upload
CREATE POLICY "Authenticated can upload banner logos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'banner-logos' AND auth.uid() IS NOT NULL);

-- Users can delete their uploads
CREATE POLICY "Users can delete own banner logos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'banner-logos' AND auth.uid()::text = (storage.foldername(name))[1]);
