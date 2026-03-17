
-- Track read receipts per user per group
CREATE TABLE public.group_read_receipts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  last_read_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(group_id, user_id)
);

ALTER TABLE public.group_read_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read group receipts"
  ON public.group_read_receipts FOR SELECT
  USING (is_group_member(auth.uid(), group_id));

CREATE POLICY "Users can upsert own receipts"
  ON public.group_read_receipts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own receipts"
  ON public.group_read_receipts FOR UPDATE
  USING (auth.uid() = user_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_read_receipts;
