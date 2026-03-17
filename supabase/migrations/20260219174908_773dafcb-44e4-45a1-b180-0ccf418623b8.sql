
-- Tabela de registros financeiros
CREATE TABLE public.financial_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  type TEXT NOT NULL DEFAULT 'despesa', -- 'receita' ou 'despesa'
  description TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  payment_date DATE,
  payee TEXT, -- favorecido
  category TEXT NOT NULL DEFAULT 'geral',
  referente TEXT, -- referência adicional
  status TEXT NOT NULL DEFAULT 'pendente', -- 'pendente', 'pago', 'vencido', 'cancelado'
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX idx_financial_records_user ON public.financial_records(user_id);
CREATE INDEX idx_financial_records_dates ON public.financial_records(due_date, payment_date);
CREATE INDEX idx_financial_records_type ON public.financial_records(user_id, type);
CREATE INDEX idx_financial_records_status ON public.financial_records(user_id, status);

-- Enable RLS
ALTER TABLE public.financial_records ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can read own financial records"
ON public.financial_records FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own financial records"
ON public.financial_records FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own financial records"
ON public.financial_records FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own financial records"
ON public.financial_records FOR DELETE
USING (auth.uid() = user_id);

-- Trigger para updated_at
CREATE TRIGGER update_financial_records_updated_at
BEFORE UPDATE ON public.financial_records
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
