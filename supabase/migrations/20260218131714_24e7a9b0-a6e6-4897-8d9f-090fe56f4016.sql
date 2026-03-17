
-- Histórico de conversas do assistente IA
CREATE TABLE public.ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  city_name TEXT NOT NULL,
  messages JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_ai_conversations_user_city ON public.ai_conversations(user_id, city_name);

ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own conversations"
ON public.ai_conversations FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own conversations"
ON public.ai_conversations FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own conversations"
ON public.ai_conversations FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own conversations"
ON public.ai_conversations FOR DELETE TO authenticated
USING (auth.uid() = user_id);
