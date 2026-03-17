
ALTER TABLE public.profiles
  ADD COLUMN phone text DEFAULT NULL,
  ADD COLUMN address text DEFAULT NULL,
  ADD COLUMN theme text DEFAULT 'system',
  ADD COLUMN font_size integer DEFAULT 16,
  ADD COLUMN visible_fields jsonb DEFAULT '{"phone": false, "address": false, "email": false}'::jsonb;
