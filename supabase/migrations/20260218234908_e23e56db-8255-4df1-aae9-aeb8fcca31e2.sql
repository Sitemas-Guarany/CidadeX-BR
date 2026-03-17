-- Allow callee to also insert signals (answer, ice-candidate, hangup, reject)
DROP POLICY "Authenticated can insert signals" ON public.call_signals;
CREATE POLICY "Participants can insert signals"
ON public.call_signals FOR INSERT
WITH CHECK (auth.uid() = caller_id OR auth.uid() = callee_id);