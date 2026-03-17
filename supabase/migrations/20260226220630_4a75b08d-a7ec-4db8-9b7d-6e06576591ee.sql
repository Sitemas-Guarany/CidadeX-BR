
-- Add unique constraint on phone to enforce at DB level
CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_unique 
ON public.profiles (phone) 
WHERE phone IS NOT NULL AND phone != '';

-- Drop the enumeration-prone function
DROP FUNCTION IF EXISTS public.check_signup_duplicates(text, text);
