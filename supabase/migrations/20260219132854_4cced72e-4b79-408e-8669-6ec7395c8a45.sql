-- Recriar views com security_invoker=on para herdar permissões do usuário que consulta

-- 1. public_profiles - remover last_seen_at por privacidade
DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles
WITH (security_invoker=on) AS
  SELECT user_id, display_name, avatar_url, referral_code
  FROM public.profiles;

-- 2. public_banners - já filtra active=true, manter assim
DROP VIEW IF EXISTS public.public_banners;
CREATE VIEW public.public_banners
WITH (security_invoker=on) AS
  SELECT id, text, link_url, logo_url, position, city_id, active, created_at, updated_at
  FROM public.banner_legends
  WHERE active = true;

-- 3. Restringir posts e post_views para usuários autenticados
DROP POLICY IF EXISTS "Anyone can read posts" ON public.posts;
CREATE POLICY "Authenticated can read posts"
  ON public.posts FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Anyone can read views" ON public.post_views;
CREATE POLICY "Authenticated can read views"
  ON public.post_views FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- 4. Restringir post_likes, post_reactions, post_reposts, poll_votes, poll_options para autenticados
DROP POLICY IF EXISTS "Anyone can read likes" ON public.post_likes;
CREATE POLICY "Authenticated can read likes"
  ON public.post_likes FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Anyone can read reactions" ON public.post_reactions;
CREATE POLICY "Authenticated can read reactions"
  ON public.post_reactions FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Anyone can read reposts" ON public.post_reposts;
CREATE POLICY "Authenticated can read reposts"
  ON public.post_reposts FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Anyone can read poll votes" ON public.poll_votes;
CREATE POLICY "Authenticated can read poll votes"
  ON public.poll_votes FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Anyone can read poll options" ON public.poll_options;
CREATE POLICY "Authenticated can read poll options"
  ON public.poll_options FOR SELECT
  USING (auth.uid() IS NOT NULL);