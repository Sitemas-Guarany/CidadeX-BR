
CREATE TABLE public.financial_record_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES public.financial_records(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  file_url text NOT NULL,
  file_name text NOT NULL,
  display_name text,
  file_type text NOT NULL DEFAULT 'image/jpeg',
  file_size integer NOT NULL DEFAULT 0,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.financial_record_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own financial attachments" ON public.financial_record_attachments
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own financial attachments" ON public.financial_record_attachments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own financial attachments" ON public.financial_record_attachments
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own financial attachments" ON public.financial_record_attachments
  FOR DELETE USING (auth.uid() = user_id);

-- Migrate existing attachment_url data to the new table
INSERT INTO public.financial_record_attachments (record_id, user_id, file_url, file_name, display_name, file_type, file_size, position)
SELECT 
  id,
  user_id,
  attachment_url,
  COALESCE(SPLIT_PART(attachment_url, '/', -1), 'anexo'),
  attachment_name,
  CASE 
    WHEN attachment_url ILIKE '%.pdf' THEN 'application/pdf'
    WHEN attachment_url ILIKE '%.png' THEN 'image/png'
    WHEN attachment_url ILIKE '%.webp' THEN 'image/webp'
    ELSE 'image/jpeg'
  END,
  0,
  0
FROM public.financial_records
WHERE attachment_url IS NOT NULL AND attachment_url != '';
