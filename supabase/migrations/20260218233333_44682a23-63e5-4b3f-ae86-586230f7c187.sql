CREATE OR REPLACE FUNCTION public.get_public_phone(target_user_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_phone text;
  v_visible jsonb;
BEGIN
  SELECT phone, visible_fields INTO v_phone, v_visible
  FROM public.profiles
  WHERE user_id = target_user_id;
  
  IF v_visible IS NOT NULL AND (v_visible->>'phone')::boolean = true AND v_phone IS NOT NULL THEN
    RETURN v_phone;
  END IF;
  
  RETURN NULL;
END;
$$;