-- Create storage bucket for chat audio messages
INSERT INTO storage.buckets (id, name, public) VALUES ('chat-audio', 'chat-audio', true);

-- Public read access
CREATE POLICY "Chat audio is publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'chat-audio');

-- Authenticated users can upload audio
CREATE POLICY "Users can upload chat audio"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'chat-audio' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Users can delete own audio
CREATE POLICY "Users can delete own chat audio"
ON storage.objects FOR DELETE
USING (bucket_id = 'chat-audio' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Add audio_url column to direct_messages
ALTER TABLE public.direct_messages ADD COLUMN audio_url text;
