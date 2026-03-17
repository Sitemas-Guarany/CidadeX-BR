
-- Fix security definer view - use SECURITY INVOKER instead
ALTER VIEW public.public_profiles SET (security_invoker = on);
