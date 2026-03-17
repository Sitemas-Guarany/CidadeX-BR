
CREATE OR REPLACE FUNCTION public.get_contact_phone(target_user_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_phone text;
BEGIN
  -- Verifica se o caller adicionou o target como contato
  IF NOT EXISTS (
    SELECT 1 FROM public.contacts
    WHERE user_id = auth.uid() AND contact_user_id = target_user_id
  ) THEN
    RETURN NULL;
  END IF;

  SELECT phone INTO v_phone
  FROM public.profiles
  WHERE user_id = target_user_id;

  RETURN v_phone;
END;
$$;
