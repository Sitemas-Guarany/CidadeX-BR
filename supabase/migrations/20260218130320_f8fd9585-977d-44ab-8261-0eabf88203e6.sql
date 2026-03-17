
-- Corrigir policy permissiva de INSERT nos access_logs
DROP POLICY "System can insert access logs" ON public.access_logs;

-- Usuários só podem inserir logs para si mesmos
CREATE POLICY "Users can insert own access logs"
ON public.access_logs FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);
