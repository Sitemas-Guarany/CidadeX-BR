
-- Create notifications table
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  actor_id UUID NOT NULL,
  type TEXT NOT NULL, -- 'like', 'reply', 'repost', 'reaction'
  post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
  emoji TEXT,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can only read their own notifications
CREATE POLICY "Users can read own notifications"
ON public.notifications FOR SELECT
USING (auth.uid() = user_id);

-- System inserts via trigger (SECURITY DEFINER), but also allow direct insert for authenticated
CREATE POLICY "Authenticated can insert notifications"
ON public.notifications FOR INSERT
WITH CHECK (true);

-- Users can update (mark as read) their own notifications
CREATE POLICY "Users can update own notifications"
ON public.notifications FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own notifications
CREATE POLICY "Users can delete own notifications"
ON public.notifications FOR DELETE
USING (auth.uid() = user_id);

-- Index for fast lookups
CREATE INDEX idx_notifications_user_id ON public.notifications(user_id, created_at DESC);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Trigger: notify on reaction
CREATE OR REPLACE FUNCTION public.notify_on_reaction()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  post_owner UUID;
BEGIN
  SELECT user_id INTO post_owner FROM public.posts WHERE id = NEW.post_id;
  IF post_owner IS NOT NULL AND post_owner != NEW.user_id THEN
    INSERT INTO public.notifications (user_id, actor_id, type, post_id, emoji)
    VALUES (post_owner, NEW.user_id, 'reaction', NEW.post_id, NEW.emoji);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_reaction_notify
AFTER INSERT ON public.post_reactions
FOR EACH ROW EXECUTE FUNCTION public.notify_on_reaction();

-- Trigger: notify on reply
CREATE OR REPLACE FUNCTION public.notify_on_reply()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  parent_owner UUID;
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    SELECT user_id INTO parent_owner FROM public.posts WHERE id = NEW.parent_id;
    IF parent_owner IS NOT NULL AND parent_owner != NEW.user_id THEN
      INSERT INTO public.notifications (user_id, actor_id, type, post_id)
      VALUES (parent_owner, NEW.user_id, 'reply', NEW.parent_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_reply_notify
AFTER INSERT ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.notify_on_reply();

-- Trigger: notify on repost
CREATE OR REPLACE FUNCTION public.notify_on_repost()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  post_owner UUID;
BEGIN
  SELECT user_id INTO post_owner FROM public.posts WHERE id = NEW.post_id;
  IF post_owner IS NOT NULL AND post_owner != NEW.user_id THEN
    INSERT INTO public.notifications (user_id, actor_id, type, post_id)
    VALUES (post_owner, NEW.user_id, 'repost', NEW.post_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_repost_notify
AFTER INSERT ON public.post_reposts
FOR EACH ROW EXECUTE FUNCTION public.notify_on_repost();
