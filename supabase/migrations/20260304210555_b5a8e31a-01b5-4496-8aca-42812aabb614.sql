
-- Table: doctors
CREATE TABLE public.doctors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  mobile text,
  address text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, name)
);

ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own doctors" ON public.doctors FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own doctors" ON public.doctors FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own doctors" ON public.doctors FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own doctors" ON public.doctors FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.limit_doctors()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE cnt INTEGER;
BEGIN
  SELECT COUNT(*) INTO cnt FROM public.doctors WHERE user_id = NEW.user_id;
  IF cnt >= 20 THEN RAISE EXCEPTION 'Limite máximo de 20 médicos atingido.'; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER check_doctors_limit BEFORE INSERT ON public.doctors FOR EACH ROW EXECUTE FUNCTION public.limit_doctors();

-- Table: medications
CREATE TABLE public.medications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  concentration text,
  frequency text NOT NULL,
  schedule_time text NOT NULL,
  icon text,
  instructions text,
  start_date date NOT NULL,
  duration_type text NOT NULL DEFAULT 'ongoing',
  duration_days integer,
  weekdays jsonb,
  doctor_id uuid REFERENCES public.doctors(id) ON DELETE SET NULL,
  suspended boolean NOT NULL DEFAULT false,
  suspended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.medications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own medications" ON public.medications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own medications" ON public.medications FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own medications" ON public.medications FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own medications" ON public.medications FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.limit_medications()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE cnt INTEGER;
BEGIN
  SELECT COUNT(*) INTO cnt FROM public.medications WHERE user_id = NEW.user_id;
  IF cnt >= 50 THEN RAISE EXCEPTION 'Limite máximo de 50 medicamentos atingido.'; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER check_medications_limit BEFORE INSERT ON public.medications FOR EACH ROW EXECUTE FUNCTION public.limit_medications();

CREATE TRIGGER update_medications_updated_at BEFORE UPDATE ON public.medications FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
