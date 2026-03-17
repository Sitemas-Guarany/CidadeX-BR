
-- Add backup preferences to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS backup_frequency text DEFAULT 'none',
ADD COLUMN IF NOT EXISTS last_backup_at timestamp with time zone DEFAULT NULL;

-- Create backups storage bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('user-backups', 'user-backups', false)
ON CONFLICT (id) DO NOTHING;

-- Users can read their own backups
CREATE POLICY "Users can read own backups"
ON storage.objects FOR SELECT
USING (bucket_id = 'user-backups' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Users can delete own backups
CREATE POLICY "Users can delete own backups"
ON storage.objects FOR DELETE
USING (bucket_id = 'user-backups' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Service role can insert backups (edge function uses service role)
CREATE POLICY "Service can insert backups"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'user-backups');
