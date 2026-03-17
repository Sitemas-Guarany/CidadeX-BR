ALTER TABLE public.profiles ADD COLUMN map_dark_mode text DEFAULT NULL;
-- NULL = auto, 'true' = night, 'false' = day