-- Add input validation to check_rate_limit
CREATE OR REPLACE FUNCTION public.check_rate_limit(p_user_id uuid, p_endpoint text, p_max_requests integer DEFAULT 60, p_window_seconds integer DEFAULT 60)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_window_start TIMESTAMP WITH TIME ZONE;
  v_count INTEGER;
BEGIN
  -- Validate inputs
  IF p_endpoint IS NULL OR length(p_endpoint) > 100 OR p_endpoint !~ '^[a-zA-Z0-9_-]+$' THEN
    RAISE EXCEPTION 'Invalid endpoint name';
  END IF;
  IF p_max_requests < 1 OR p_max_requests > 10000 THEN
    RAISE EXCEPTION 'Invalid max_requests value';
  END IF;
  IF p_window_seconds < 1 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'Invalid window_seconds value';
  END IF;

  v_window_start := now() - (p_window_seconds || ' seconds')::interval;
  
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
$function$;

-- Add input validation to log_access
CREATE OR REPLACE FUNCTION public.log_access(p_user_id uuid, p_action text, p_resource_type text, p_resource_id text DEFAULT NULL::text, p_ip_address text DEFAULT NULL::text, p_user_agent text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Validate inputs
  IF p_action IS NULL OR length(p_action) > 100 OR p_action !~ '^[a-zA-Z0-9_-]+$' THEN
    RAISE EXCEPTION 'Invalid action';
  END IF;
  IF p_resource_type IS NULL OR length(p_resource_type) > 100 OR p_resource_type !~ '^[a-zA-Z0-9_-]+$' THEN
    RAISE EXCEPTION 'Invalid resource_type';
  END IF;
  IF p_resource_id IS NOT NULL AND length(p_resource_id) > 255 THEN
    RAISE EXCEPTION 'Invalid resource_id';
  END IF;

  INSERT INTO public.access_logs (user_id, action, resource_type, resource_id, ip_address, user_agent, metadata)
  VALUES (p_user_id, p_action, p_resource_type, p_resource_id, left(p_ip_address, 45), left(p_user_agent, 500), p_metadata);
END;
$function$;