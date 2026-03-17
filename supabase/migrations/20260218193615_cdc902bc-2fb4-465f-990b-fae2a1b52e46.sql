
-- Drop the DELETE policy that already exists and re-create it
DROP POLICY IF EXISTS "Users can delete own banner logos" ON storage.objects;

CREATE POLICY "Users can delete own banner logos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'banner-logos' AND
  auth.uid()::text = (storage.foldername(name))[1]
);
