
-- Add is_public flag to groups
ALTER TABLE public.groups ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT false;

-- Allow authenticated users to see public groups in their city (for discovery)
-- The existing "Anyone authenticated can view groups by invite code" policy already covers this
-- since it uses auth.uid() IS NOT NULL, but let's make it more explicit by keeping it as is.

-- Index for public group discovery
CREATE INDEX idx_groups_public_city ON public.groups(city_id, is_public) WHERE is_public = true;
