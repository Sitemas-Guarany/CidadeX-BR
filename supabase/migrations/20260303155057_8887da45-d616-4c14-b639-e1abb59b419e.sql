
CREATE OR REPLACE FUNCTION public.limit_notebooks()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE cnt INTEGER;
BEGIN
  SELECT COUNT(*) INTO cnt FROM public.notebooks WHERE user_id = NEW.user_id;
  IF cnt >= 300 THEN RAISE EXCEPTION 'Limite máximo de 300 cadernos atingido.'; END IF;
  RETURN NEW;
END;
$$;
