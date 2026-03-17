
-- Create storage bucket for note images
INSERT INTO storage.buckets (id, name, public) VALUES ('note-images', 'note-images', true);

-- Allow authenticated users to upload their own note images
CREATE POLICY "Users can upload note images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'note-images' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Allow public read access (images are embedded in notes)
CREATE POLICY "Note images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'note-images');

-- Allow users to delete their own note images
CREATE POLICY "Users can delete own note images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'note-images' AND auth.uid()::text = (storage.foldername(name))[1]);
