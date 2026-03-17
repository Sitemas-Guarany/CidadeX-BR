
-- Limit saved addresses to 10 per user via validation trigger
CREATE OR REPLACE FUNCTION public.limit_saved_addresses()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  addr_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO addr_count
  FROM public.saved_addresses
  WHERE user_id = NEW.user_id;

  IF addr_count >= 10 THEN
    RAISE EXCEPTION 'Limite máximo de 10 endereços salvos atingido.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER check_saved_addresses_limit
BEFORE INSERT ON public.saved_addresses
FOR EACH ROW
EXECUTE FUNCTION public.limit_saved_addresses();
