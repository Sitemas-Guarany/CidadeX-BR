
-- Novas colunas para parcelamento
ALTER TABLE public.financial_records
  ADD COLUMN IF NOT EXISTS installment_total integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS installment_number integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS installment_group_id uuid DEFAULT NULL;

-- Novas colunas para juros e desconto (valores em R$)
ALTER TABLE public.financial_records
  ADD COLUMN IF NOT EXISTS interest_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount numeric DEFAULT 0;

-- Coluna para anexo (URL do arquivo)
ALTER TABLE public.financial_records
  ADD COLUMN IF NOT EXISTS attachment_url text DEFAULT NULL;

-- Índice para agrupar parcelas
CREATE INDEX IF NOT EXISTS idx_financial_records_installment_group
  ON public.financial_records (installment_group_id)
  WHERE installment_group_id IS NOT NULL;

-- Bucket de storage para anexos financeiros
INSERT INTO storage.buckets (id, name, public)
VALUES ('financial-attachments', 'financial-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Políticas de storage para anexos financeiros
CREATE POLICY "Users can upload own financial attachments"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'financial-attachments'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view own financial attachments"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'financial-attachments'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete own financial attachments"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'financial-attachments'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
