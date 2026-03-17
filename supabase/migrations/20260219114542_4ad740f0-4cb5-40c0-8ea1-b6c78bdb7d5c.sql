-- Add reply_to_id to direct_messages
ALTER TABLE public.direct_messages ADD COLUMN reply_to_id uuid REFERENCES public.direct_messages(id) ON DELETE SET NULL;

-- Add reply_to_id to group_messages
ALTER TABLE public.group_messages ADD COLUMN reply_to_id uuid REFERENCES public.group_messages(id) ON DELETE SET NULL;