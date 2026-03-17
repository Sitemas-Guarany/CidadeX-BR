CREATE OR REPLACE FUNCTION public.limit_financial_accounts()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  account_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO account_count
  FROM public.financial_accounts
  WHERE user_id = NEW.user_id;

  IF account_count >= 10 THEN
    RAISE EXCEPTION 'Limite máximo de 10 contas atingido.';
  END IF;

  RETURN NEW;
END;
$function$;