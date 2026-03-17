CREATE POLICY "Users can update own attachments"
ON public.agenda_attachments FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);