
-- Tabela de Cadernos
CREATE TABLE public.notebooks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.notebooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own notebooks" ON public.notebooks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own notebooks" ON public.notebooks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own notebooks" ON public.notebooks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own notebooks" ON public.notebooks FOR DELETE USING (auth.uid() = user_id);

-- Limite de 20 cadernos por usuário
CREATE OR REPLACE FUNCTION public.limit_notebooks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE cnt INTEGER;
BEGIN
  SELECT COUNT(*) INTO cnt FROM public.notebooks WHERE user_id = NEW.user_id;
  IF cnt >= 20 THEN RAISE EXCEPTION 'Limite máximo de 20 cadernos atingido.'; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER check_notebook_limit
BEFORE INSERT ON public.notebooks
FOR EACH ROW EXECUTE FUNCTION public.limit_notebooks();

-- Trigger updated_at
CREATE TRIGGER update_notebooks_updated_at
BEFORE UPDATE ON public.notebooks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tabela de Notas
CREATE TABLE public.notebook_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  notebook_id UUID NOT NULL REFERENCES public.notebooks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  pinned BOOLEAN NOT NULL DEFAULT false,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.notebook_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own notes" ON public.notebook_notes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own notes" ON public.notebook_notes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own notes" ON public.notebook_notes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own notes" ON public.notebook_notes FOR DELETE USING (auth.uid() = user_id);

-- Limite de 100 notas por caderno
CREATE OR REPLACE FUNCTION public.limit_notebook_notes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE cnt INTEGER;
BEGIN
  SELECT COUNT(*) INTO cnt FROM public.notebook_notes WHERE notebook_id = NEW.notebook_id;
  IF cnt >= 100 THEN RAISE EXCEPTION 'Limite máximo de 100 notas por caderno atingido.'; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER check_notebook_note_limit
BEFORE INSERT ON public.notebook_notes
FOR EACH ROW EXECUTE FUNCTION public.limit_notebook_notes();

-- Trigger updated_at
CREATE TRIGGER update_notebook_notes_updated_at
BEFORE UPDATE ON public.notebook_notes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Índices
CREATE INDEX idx_notebooks_user_id ON public.notebooks(user_id);
CREATE INDEX idx_notebook_notes_notebook_id ON public.notebook_notes(notebook_id);
CREATE INDEX idx_notebook_notes_user_id ON public.notebook_notes(user_id);
