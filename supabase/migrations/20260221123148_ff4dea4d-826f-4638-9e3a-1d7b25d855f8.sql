
-- Add category column to shopping_items
ALTER TABLE public.shopping_items ADD COLUMN category text DEFAULT NULL;
