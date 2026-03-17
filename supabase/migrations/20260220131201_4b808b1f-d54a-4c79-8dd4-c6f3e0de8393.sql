
-- Tabela de favorecidos financeiros (contatos financeiros fixos)
CREATE TABLE public.financial_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.financial_contacts ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can read own financial contacts"
ON public.financial_contacts FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own financial contacts"
ON public.financial_contacts FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own financial contacts"
ON public.financial_contacts FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own financial contacts"
ON public.financial_contacts FOR DELETE
USING (auth.uid() = user_id);

-- Trigger para updated_at
CREATE TRIGGER update_financial_contacts_updated_at
BEFORE UPDATE ON public.financial_contacts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
