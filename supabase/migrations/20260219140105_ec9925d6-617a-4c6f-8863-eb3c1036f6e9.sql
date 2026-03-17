
CREATE OR REPLACE FUNCTION public.check_signup_duplicates(p_email text, p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb := '{"email_exists": false, "phone_exists": false}'::jsonb;
BEGIN
  -- Check email in auth.users
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = lower(trim(p_email))) THEN
    v_result := jsonb_set(v_result, '{email_exists}', 'true');
  END IF;

  -- Check phone in profiles (both raw digits and formatted)
  IF p_phone IS NOT NULL AND length(p_phone) > 0 THEN
    IF EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE phone = p_phone 
         OR phone = regexp_replace(p_phone, '\D', '', 'g')
    ) THEN
      v_result := jsonb_set(v_result, '{phone_exists}', 'true');
    END IF;
  END IF;

  RETURN v_result;
END;
$$;

-- Grant access to anon so unauthenticated users can check during signup
GRANT EXECUTE ON FUNCTION public.check_signup_duplicates(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.check_signup_duplicates(text, text) TO authenticated;
