
-- Create financial_accounts table
CREATE TABLE public.financial_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  account_type TEXT NOT NULL DEFAULT 'carteira', -- 'carteira' or 'banco'
  name TEXT NOT NULL,
  bank_name TEXT,
  bank_code TEXT,
  account_number TEXT,
  account_digit TEXT,
  initial_balance NUMERIC NOT NULL DEFAULT 0,
  informed_balance NUMERIC, -- for sync verification
  informed_balance_date DATE, -- when the user last informed the balance
  color TEXT DEFAULT '#3b82f6',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.financial_accounts ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can read own accounts" ON public.financial_accounts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own accounts" ON public.financial_accounts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own accounts" ON public.financial_accounts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own accounts" ON public.financial_accounts FOR DELETE USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_financial_accounts_updated_at
  BEFORE UPDATE ON public.financial_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Limit to 5 accounts per user
CREATE OR REPLACE FUNCTION public.limit_financial_accounts()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  account_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO account_count
  FROM public.financial_accounts
  WHERE user_id = NEW.user_id;

  IF account_count >= 5 THEN
    RAISE EXCEPTION 'Limite máximo de 5 contas atingido.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER limit_financial_accounts_trigger
  BEFORE INSERT ON public.financial_accounts
  FOR EACH ROW EXECUTE FUNCTION public.limit_financial_accounts();

-- Add account_id to financial_records (nullable so existing records keep working)
ALTER TABLE public.financial_records ADD COLUMN account_id UUID REFERENCES public.financial_accounts(id) ON DELETE SET NULL;
