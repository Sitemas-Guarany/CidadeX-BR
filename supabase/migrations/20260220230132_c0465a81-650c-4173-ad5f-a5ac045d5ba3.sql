-- Add payment_method column to financial_records
ALTER TABLE public.financial_records
ADD COLUMN payment_method text DEFAULT NULL;