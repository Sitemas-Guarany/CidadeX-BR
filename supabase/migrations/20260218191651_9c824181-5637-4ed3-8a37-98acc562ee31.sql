
-- Índices para melhorar performance de queries frequentes

-- Posts: busca por cidade e ordenação por data (feed principal)
CREATE INDEX IF NOT EXISTS idx_posts_city_created ON public.posts (city_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_parent_id ON public.posts (parent_id) WHERE parent_id IS NOT NULL;

-- Reactions: busca por post_id (enriquecimento de posts)
CREATE INDEX IF NOT EXISTS idx_post_reactions_post_id ON public.post_reactions (post_id);

-- Reposts: busca por post_id
CREATE INDEX IF NOT EXISTS idx_post_reposts_post_id ON public.post_reposts (post_id);

-- Views: busca por post_id
CREATE INDEX IF NOT EXISTS idx_post_views_post_id ON public.post_views (post_id);

-- Poll options/votes: busca por post_id
CREATE INDEX IF NOT EXISTS idx_poll_options_post_id ON public.poll_options (post_id);
CREATE INDEX IF NOT EXISTS idx_poll_votes_post_id ON public.poll_votes (post_id);

-- Access logs: limpeza por data
CREATE INDEX IF NOT EXISTS idx_access_logs_created_at ON public.access_logs (created_at);

-- Rate limits: busca por user_id + endpoint
CREATE INDEX IF NOT EXISTS idx_rate_limits_user_endpoint ON public.rate_limits (user_id, endpoint);

-- Notifications: busca por user_id e não lidas
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications (user_id, read) WHERE read = false;

-- Chat messages: busca por cidade e ordenação
CREATE INDEX IF NOT EXISTS idx_chat_messages_city_created ON public.chat_messages (city_id, created_at DESC);

-- Traffic alerts: busca por cidade e expiração (sem filtro parcial)
CREATE INDEX IF NOT EXISTS idx_traffic_alerts_city_expires ON public.traffic_alerts (city_id, expires_at DESC);

-- Group messages: busca por grupo e data
CREATE INDEX IF NOT EXISTS idx_group_messages_group_created ON public.group_messages (group_id, created_at DESC);

-- News/Events/Places cache: busca por cidade e data
CREATE INDEX IF NOT EXISTS idx_news_cache_city ON public.news_cache (city_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_cache_city ON public.events_cache (city_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_places_cache_city_cat ON public.places_cache (city_name, category, created_at DESC);

-- Invites: contagem por inviter
CREATE INDEX IF NOT EXISTS idx_invites_inviter_status ON public.invites (inviter_id, status);
