
-- Enum para papel no grupo
CREATE TYPE public.group_role AS ENUM ('admin', 'member');

-- Tabela de grupos
CREATE TABLE public.groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  city_id TEXT NOT NULL,
  avatar_url TEXT,
  invite_code TEXT NOT NULL DEFAULT encode(gen_random_bytes(6), 'hex'),
  created_by UUID NOT NULL,
  max_members INTEGER NOT NULL DEFAULT 50,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(invite_code)
);

-- Membros do grupo
CREATE TABLE public.group_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role public.group_role NOT NULL DEFAULT 'member',
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(group_id, user_id)
);

-- Mensagens do grupo
CREATE TABLE public.group_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  video_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX idx_group_members_user ON public.group_members(user_id);
CREATE INDEX idx_group_members_group ON public.group_members(group_id);
CREATE INDEX idx_group_messages_group ON public.group_messages(group_id);
CREATE INDEX idx_group_messages_created ON public.group_messages(group_id, created_at DESC);
CREATE INDEX idx_groups_city ON public.groups(city_id);
CREATE INDEX idx_groups_invite ON public.groups(invite_code);

-- RLS em groups
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

-- Função para checar se é membro
CREATE OR REPLACE FUNCTION public.is_group_member(_user_id UUID, _group_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.group_members WHERE user_id = _user_id AND group_id = _group_id)
$$;

-- Função para checar se é admin do grupo
CREATE OR REPLACE FUNCTION public.is_group_admin(_user_id UUID, _group_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.group_members WHERE user_id = _user_id AND group_id = _group_id AND role = 'admin')
$$;

-- Políticas de groups
CREATE POLICY "Members can view their groups" ON public.groups
FOR SELECT USING (public.is_group_member(auth.uid(), id));

CREATE POLICY "Anyone authenticated can view groups by invite code" ON public.groups
FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated can create groups" ON public.groups
FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Admins can update group" ON public.groups
FOR UPDATE USING (public.is_group_admin(auth.uid(), id));

CREATE POLICY "Admins can delete group" ON public.groups
FOR DELETE USING (public.is_group_admin(auth.uid(), id));

-- RLS em group_members
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can see group members" ON public.group_members
FOR SELECT USING (public.is_group_member(auth.uid(), group_id));

CREATE POLICY "Authenticated can join groups" ON public.group_members
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can update members" ON public.group_members
FOR UPDATE USING (public.is_group_admin(auth.uid(), group_id));

CREATE POLICY "Admins can remove members or self-leave" ON public.group_members
FOR DELETE USING (
  public.is_group_admin(auth.uid(), group_id) OR auth.uid() = user_id
);

-- RLS em group_messages
ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read group messages" ON public.group_messages
FOR SELECT USING (public.is_group_member(auth.uid(), group_id));

CREATE POLICY "Members can send messages" ON public.group_messages
FOR INSERT WITH CHECK (
  auth.uid() = user_id AND public.is_group_member(auth.uid(), group_id)
);

CREATE POLICY "Users can delete own messages" ON public.group_messages
FOR DELETE USING (auth.uid() = user_id);

-- Trigger updated_at para groups
CREATE TRIGGER update_groups_updated_at
BEFORE UPDATE ON public.groups
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime para mensagens de grupo
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_members;

-- Storage bucket para mídia dos grupos
INSERT INTO storage.buckets (id, name, public) VALUES ('group-media', 'group-media', true);

CREATE POLICY "Authenticated can upload group media"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'group-media' AND auth.uid() IS NOT NULL);

CREATE POLICY "Anyone can view group media"
ON storage.objects FOR SELECT
USING (bucket_id = 'group-media');
