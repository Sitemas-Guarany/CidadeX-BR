-- Add call_signals cleanup to existing cleanup function
CREATE OR REPLACE FUNCTION public.cleanup_old_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  DELETE FROM public.access_logs WHERE created_at < now() - interval '7 days';
  DELETE FROM public.rate_limits WHERE window_start < now() - interval '1 hour';
  -- Clean up stale call signals older than 5 minutes (calls are ephemeral)
  DELETE FROM public.call_signals WHERE created_at < now() - interval '5 minutes';
END;
$$;