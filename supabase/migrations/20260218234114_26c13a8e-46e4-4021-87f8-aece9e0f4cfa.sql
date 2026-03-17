-- Table for WebRTC signaling
CREATE TABLE public.call_signals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  caller_id uuid NOT NULL,
  callee_id uuid NOT NULL,
  signal_type text NOT NULL, -- 'offer', 'answer', 'ice-candidate', 'hangup', 'reject', 'busy'
  signal_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.call_signals ENABLE ROW LEVEL SECURITY;

-- Callers and callees can read their own signals
CREATE POLICY "Users can read own signals"
ON public.call_signals FOR SELECT
USING (auth.uid() = caller_id OR auth.uid() = callee_id);

-- Authenticated users can insert signals
CREATE POLICY "Authenticated can insert signals"
ON public.call_signals FOR INSERT
WITH CHECK (auth.uid() = caller_id);

-- Users can delete their own signals (cleanup)
CREATE POLICY "Users can delete own signals"
ON public.call_signals FOR DELETE
USING (auth.uid() = caller_id OR auth.uid() = callee_id);

-- Auto-cleanup old signals (older than 5 min)
CREATE INDEX idx_call_signals_created ON public.call_signals(created_at);
CREATE INDEX idx_call_signals_callee ON public.call_signals(callee_id, signal_type);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.call_signals;