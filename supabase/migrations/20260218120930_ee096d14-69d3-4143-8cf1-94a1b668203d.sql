
-- Add video_url column to chat_messages
ALTER TABLE public.chat_messages ADD COLUMN video_url text;

-- Create storage bucket for chat videos
INSERT INTO storage.buckets (id, name, public) VALUES ('chat-videos', 'chat-videos', true);

-- Allow authenticated users to upload chat videos
CREATE POLICY "Authenticated users can upload chat videos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'chat-videos' AND auth.uid() IS NOT NULL);

-- Allow anyone to view chat videos
CREATE POLICY "Anyone can view chat videos"
ON storage.objects FOR SELECT
USING (bucket_id = 'chat-videos');
