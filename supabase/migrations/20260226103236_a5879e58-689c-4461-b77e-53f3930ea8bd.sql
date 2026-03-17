
-- 1. Tabela de anexos da agenda
CREATE TABLE public.agenda_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agenda_item_id UUID NOT NULL REFERENCES public.agenda_items(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL DEFAULT 'image/jpeg',
  file_size INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 2. Índice para busca por item
CREATE INDEX idx_agenda_attachments_item ON public.agenda_attachments(agenda_item_id);

-- 3. RLS
ALTER TABLE public.agenda_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own attachments"
  ON public.agenda_attachments FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own attachments"
  ON public.agenda_attachments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own attachments"
  ON public.agenda_attachments FOR DELETE
  USING (auth.uid() = user_id);

-- 4. Trigger para limitar 10 anexos por compromisso
CREATE OR REPLACE FUNCTION public.limit_agenda_attachments()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE cnt INTEGER;
BEGIN
  SELECT COUNT(*) INTO cnt FROM public.agenda_attachments WHERE agenda_item_id = NEW.agenda_item_id;
  IF cnt >= 10 THEN
    RAISE EXCEPTION 'Limite máximo de 10 anexos por compromisso atingido.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER check_agenda_attachments_limit
  BEFORE INSERT ON public.agenda_attachments
  FOR EACH ROW EXECUTE FUNCTION public.limit_agenda_attachments();

-- 5. Bucket de storage (privado)
INSERT INTO storage.buckets (id, name, public) VALUES ('agenda-attachments', 'agenda-attachments', false);

-- 6. Storage policies
CREATE POLICY "Users can upload agenda attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'agenda-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can view own agenda attachments"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'agenda-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete own agenda attachments"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'agenda-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 7. Realtime para anexos
ALTER PUBLICATION supabase_realtime ADD TABLE public.agenda_attachments;
