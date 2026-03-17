
-- Tabela de auditoria de acessos
CREATE TABLE public.access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para consultas eficientes
CREATE INDEX idx_access_logs_user_id ON public.access_logs(user_id);
CREATE INDEX idx_access_logs_created_at ON public.access_logs(created_at DESC);
CREATE INDEX idx_access_logs_action ON public.access_logs(action);

-- RLS: apenas o próprio usuário vê seus logs, admins veem tudo
ALTER TABLE public.access_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own access logs"
ON public.access_logs FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "System can insert access logs"
ON public.access_logs FOR INSERT
TO authenticated
WITH CHECK (true);

-- Tabela de rate limiting
CREATE TABLE public.rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_rate_limits_user_endpoint ON public.rate_limits(user_id, endpoint);
CREATE INDEX idx_rate_limits_window ON public.rate_limits(window_start);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Apenas o sistema (via service_role) gerencia rate limits
CREATE POLICY "Authenticated users can read own rate limits"
ON public.rate_limits FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Função para checar e incrementar rate limit
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_user_id UUID,
  p_endpoint TEXT,
  p_max_requests INTEGER DEFAULT 60,
  p_window_seconds INTEGER DEFAULT 60
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start TIMESTAMP WITH TIME ZONE;
  v_count INTEGER;
BEGIN
  v_window_start := now() - (p_window_seconds || ' seconds')::interval;
  
  -- Upsert: reset se janela expirou, incrementa se não
  INSERT INTO public.rate_limits (user_id, endpoint, request_count, window_start)
  VALUES (p_user_id, p_endpoint, 1, now())
  ON CONFLICT (user_id, endpoint)
  DO UPDATE SET
    request_count = CASE
      WHEN rate_limits.window_start < v_window_start THEN 1
      ELSE rate_limits.request_count + 1
    END,
    window_start = CASE
      WHEN rate_limits.window_start < v_window_start THEN now()
      ELSE rate_limits.window_start
    END
  RETURNING request_count INTO v_count;
  
  RETURN v_count <= p_max_requests;
END;
$$;

-- Função para registrar acesso
CREATE OR REPLACE FUNCTION public.log_access(
  p_user_id UUID,
  p_action TEXT,
  p_resource_type TEXT,
  p_resource_id TEXT DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.access_logs (user_id, action, resource_type, resource_id, ip_address, user_agent, metadata)
  VALUES (p_user_id, p_action, p_resource_type, p_resource_id, p_ip_address, p_user_agent, p_metadata);
END;
$$;

-- Limpeza automática de logs antigos (30 dias) e rate limits expirados
CREATE OR REPLACE FUNCTION public.cleanup_old_logs()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.access_logs WHERE created_at < now() - interval '30 days';
  DELETE FROM public.rate_limits WHERE window_start < now() - interval '1 hour';
END;
$$;
