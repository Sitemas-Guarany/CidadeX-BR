
-- 1. Enum for roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- 2. User roles table
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role app_role NOT NULL DEFAULT 'user',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- RLS: only admins can manage roles, users can read own
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users can read own role"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can read all roles"
  ON public.user_roles FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert roles"
  ON public.user_roles FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update roles"
  ON public.user_roles FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete roles"
  ON public.user_roles FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

-- 3. Global settings table (key-value store for admin controls)
CREATE TABLE public.global_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.global_settings ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read settings
CREATE POLICY "Anyone can read global settings"
  ON public.global_settings FOR SELECT
  USING (true);

-- Only admins can modify
CREATE POLICY "Admins can insert settings"
  ON public.global_settings FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update settings"
  ON public.global_settings FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete settings"
  ON public.global_settings FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

-- 4. Insert the admin user
INSERT INTO public.user_roles (user_id, role)
VALUES ('eb9cf5c1-00c4-407d-af05-9ed54ed52163', 'admin');

-- 5. Insert default global settings
INSERT INTO public.global_settings (key, value) VALUES
  ('visible_tabs', '{"info": true, "contatos": true, "social": true, "mapa": true, "navegar": true, "agenda": true, "bairros": true, "ruas": true, "clima": true, "eventos": true, "noticias": true, "legendas": true, "convidar": true}'::jsonb),
  ('app_notice', '{"text": "", "active": false}'::jsonb);

-- 6. Admin moderation: allow admins to delete any post
CREATE POLICY "Admins can delete any post"
  ON public.posts FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

-- Admin moderation: allow admins to delete any chat message
CREATE POLICY "Admins can delete chat messages"
  ON public.chat_messages FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

-- Admin moderation: allow admins to delete any group message
CREATE POLICY "Admins can delete group messages"
  ON public.group_messages FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

-- Admin moderation: allow admins to delete any direct message
CREATE POLICY "Admins can delete any DM"
  ON public.direct_messages FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to read all profiles for user management
CREATE POLICY "Admins can read all profiles"
  ON public.profiles FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));
