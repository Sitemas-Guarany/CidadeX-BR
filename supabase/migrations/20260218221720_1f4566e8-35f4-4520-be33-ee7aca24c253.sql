
CREATE TABLE public.saved_addresses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  label text NOT NULL,
  name text,
  phone text,
  mobile text,
  address text,
  number text,
  neighborhood text,
  city text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.saved_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own addresses" ON public.saved_addresses FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own addresses" ON public.saved_addresses FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own addresses" ON public.saved_addresses FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Users can update own addresses" ON public.saved_addresses FOR UPDATE USING (auth.uid() = user_id);
