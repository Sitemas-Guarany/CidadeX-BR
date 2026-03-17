
-- Create agenda items table
CREATE TABLE public.agenda_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'geral',
  status TEXT NOT NULL DEFAULT 'em_andamento',
  scheduled_date TIMESTAMP WITH TIME ZONE NOT NULL,
  completion_date TIMESTAMP WITH TIME ZONE,
  referente TEXT,
  
  -- Origin address
  origin_name TEXT,
  origin_phone TEXT,
  origin_mobile TEXT,
  origin_address TEXT,
  origin_number TEXT,
  origin_neighborhood TEXT,
  origin_city TEXT,
  
  -- Destination address
  destination_name TEXT,
  destination_phone TEXT,
  destination_mobile TEXT,
  destination_address TEXT,
  destination_number TEXT,
  destination_neighborhood TEXT,
  destination_city TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.agenda_items ENABLE ROW LEVEL SECURITY;

-- Users can only see their own items
CREATE POLICY "Users can read own agenda items"
ON public.agenda_items FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own agenda items"
ON public.agenda_items FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own agenda items"
ON public.agenda_items FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own agenda items"
ON public.agenda_items FOR DELETE
USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_agenda_items_updated_at
BEFORE UPDATE ON public.agenda_items
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
