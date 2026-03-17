-- 1. Update log_access to anonymize IP addresses (mask last octet for IPv4, last 80 bits for IPv6)
CREATE OR REPLACE FUNCTION public.log_access(p_user_id uuid, p_action text, p_resource_type text, p_resource_id text DEFAULT NULL::text, p_ip_address text DEFAULT NULL::text, p_user_agent text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_masked_ip text;
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

  -- Anonymize IP: mask last octet for IPv4, store only prefix for IPv6
  IF p_ip_address IS NOT NULL AND p_ip_address != 'unknown' THEN
    IF p_ip_address ~ '^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$' THEN
      -- IPv4: replace last octet with 0
      v_masked_ip := regexp_replace(p_ip_address, '\.\d{1,3}$', '.0');
    ELSIF p_ip_address ~ ':' THEN
      -- IPv6: keep only first 4 groups
      v_masked_ip := split_part(p_ip_address, ':', 1) || ':' || split_part(p_ip_address, ':', 2) || ':' || split_part(p_ip_address, ':', 3) || ':' || split_part(p_ip_address, ':', 4) || '::';
    ELSE
      v_masked_ip := 'masked';
    END IF;
  ELSE
    v_masked_ip := NULL;
  END IF;

  INSERT INTO public.access_logs (user_id, action, resource_type, resource_id, ip_address, user_agent, metadata)
  VALUES (p_user_id, p_action, p_resource_type, p_resource_id, v_masked_ip, left(p_user_agent, 500), p_metadata);
END;
$function$;

-- 2. Update cleanup to retain only 7 days instead of 30
CREATE OR REPLACE FUNCTION public.cleanup_old_logs()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.access_logs WHERE created_at < now() - interval '7 days';
  DELETE FROM public.rate_limits WHERE window_start < now() - interval '1 hour';
END;
$function$;

-- 3. Anonymize existing IPs in the database
UPDATE public.access_logs
SET ip_address = CASE
  WHEN ip_address ~ '^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$' THEN regexp_replace(ip_address, '\.\d{1,3}$', '.0')
  WHEN ip_address ~ ':' THEN split_part(ip_address, ':', 1) || ':' || split_part(ip_address, ':', 2) || ':' || split_part(ip_address, ':', 3) || ':' || split_part(ip_address, ':', 4) || '::'
  WHEN ip_address IS NOT NULL AND ip_address != 'unknown' THEN 'masked'
  ELSE ip_address
END
WHERE ip_address IS NOT NULL AND ip_address != 'unknown';

-- 4. Delete logs older than 7 days now
DELETE FROM public.access_logs WHERE created_at < now() - interval '7 days';