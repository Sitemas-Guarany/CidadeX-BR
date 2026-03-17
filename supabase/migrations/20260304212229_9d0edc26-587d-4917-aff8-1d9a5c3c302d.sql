
-- Table to log when a medication was taken
CREATE TABLE public.medication_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medication_id uuid NOT NULL REFERENCES public.medications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  taken_at timestamptz NOT NULL DEFAULT now(),
  scheduled_time text, -- the original scheduled time (HH:MM) for reference
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Unique: one log per medication per date (can be extended later)
CREATE UNIQUE INDEX medication_logs_med_date_unique ON public.medication_logs (medication_id, log_date);

-- RLS
ALTER TABLE public.medication_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own medication logs"
  ON public.medication_logs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own medication logs"
  ON public.medication_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own medication logs"
  ON public.medication_logs FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own medication logs"
  ON public.medication_logs FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Limit: max 500 logs per user
CREATE OR REPLACE FUNCTION public.limit_medication_logs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE cnt INTEGER;
BEGIN
  SELECT COUNT(*) INTO cnt FROM public.medication_logs WHERE user_id = NEW.user_id;
  IF cnt >= 500 THEN RAISE EXCEPTION 'Limite máximo de 500 registros de medicação atingido.'; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER check_medication_logs_limit
  BEFORE INSERT ON public.medication_logs
  FOR EACH ROW EXECUTE FUNCTION public.limit_medication_logs();
