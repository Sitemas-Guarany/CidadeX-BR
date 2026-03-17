
-- Table to track invites/referrals
CREATE TABLE public.invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_id uuid NOT NULL,
  invited_user_id uuid,
  invite_code text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz
);

-- Index for fast lookups
CREATE INDEX idx_invites_inviter ON public.invites(inviter_id);
CREATE INDEX idx_invites_code ON public.invites(invite_code);
CREATE UNIQUE INDEX idx_invites_invited_user ON public.invites(invited_user_id) WHERE invited_user_id IS NOT NULL;

-- Enable RLS
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

-- Users can read their own sent invites
CREATE POLICY "Users can read own invites"
ON public.invites FOR SELECT
USING (auth.uid() = inviter_id);

-- Users can insert invites for themselves
CREATE POLICY "Users can create invites"
ON public.invites FOR INSERT
WITH CHECK (auth.uid() = inviter_id);

-- Service role updates invited_user_id on signup (via edge function)
-- No direct update policy for regular users

-- Add referral_code column to profiles for persistent invite codes
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referral_code text UNIQUE;

-- Generate referral codes for existing profiles
UPDATE public.profiles SET referral_code = encode(extensions.gen_random_bytes(4), 'hex') WHERE referral_code IS NULL;

-- Default for new profiles
ALTER TABLE public.profiles ALTER COLUMN referral_code SET DEFAULT encode(extensions.gen_random_bytes(4), 'hex');
