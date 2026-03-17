
-- Alertas de trânsito colaborativos
CREATE TABLE public.traffic_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  city_id TEXT NOT NULL,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('transito', 'buraco', 'acidente', 'blitz', 'outro')),
  description TEXT,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  upvotes INTEGER NOT NULL DEFAULT 0,
  downvotes INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '4 hours'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_traffic_alerts_city ON public.traffic_alerts(city_id);
CREATE INDEX idx_traffic_alerts_expires ON public.traffic_alerts(expires_at);
CREATE INDEX idx_traffic_alerts_location ON public.traffic_alerts(latitude, longitude);

ALTER TABLE public.traffic_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read alerts"
ON public.traffic_alerts FOR SELECT
USING (true);

CREATE POLICY "Authenticated can create alerts"
ON public.traffic_alerts FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own alerts"
ON public.traffic_alerts FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- Votos nos alertas
CREATE TABLE public.alert_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id UUID REFERENCES public.traffic_alerts(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  vote_type TEXT NOT NULL CHECK (vote_type IN ('up', 'down')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_alert_votes_unique ON public.alert_votes(alert_id, user_id);

ALTER TABLE public.alert_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read votes"
ON public.alert_votes FOR SELECT
USING (true);

CREATE POLICY "Authenticated can vote"
ON public.alert_votes FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own votes"
ON public.alert_votes FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own votes"
ON public.alert_votes FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- Enable realtime for alerts
ALTER PUBLICATION supabase_realtime ADD TABLE public.traffic_alerts;

-- Function to update vote counts
CREATE OR REPLACE FUNCTION public.update_alert_votes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    UPDATE public.traffic_alerts SET
      upvotes = (SELECT COUNT(*) FROM public.alert_votes WHERE alert_id = NEW.alert_id AND vote_type = 'up'),
      downvotes = (SELECT COUNT(*) FROM public.alert_votes WHERE alert_id = NEW.alert_id AND vote_type = 'down')
    WHERE id = NEW.alert_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.traffic_alerts SET
      upvotes = (SELECT COUNT(*) FROM public.alert_votes WHERE alert_id = OLD.alert_id AND vote_type = 'up'),
      downvotes = (SELECT COUNT(*) FROM public.alert_votes WHERE alert_id = OLD.alert_id AND vote_type = 'down')
    WHERE id = OLD.alert_id;
    RETURN OLD;
  END IF;
END;
$$;

CREATE TRIGGER trigger_update_alert_votes
AFTER INSERT OR UPDATE OR DELETE ON public.alert_votes
FOR EACH ROW EXECUTE FUNCTION public.update_alert_votes();
