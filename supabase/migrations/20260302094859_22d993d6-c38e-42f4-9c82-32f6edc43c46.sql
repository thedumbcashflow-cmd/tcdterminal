
-- Feature Requests table
CREATE TABLE public.feature_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'low',
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.feature_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create own feature requests"
ON public.feature_requests FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can read own feature requests"
ON public.feature_requests FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Paid admins can read all feature requests"
ON public.feature_requests FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin') AND
  get_subscription_tier(auth.uid()) IN ('pro', 'whale')
);

CREATE POLICY "Paid admins can update feature requests"
ON public.feature_requests FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin') AND
  get_subscription_tier(auth.uid()) IN ('pro', 'whale')
);

CREATE TRIGGER update_feature_requests_updated_at
BEFORE UPDATE ON public.feature_requests
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Provider Status table
CREATE TABLE public.provider_status (
  provider TEXT PRIMARY KEY,
  last_success_at TIMESTAMPTZ,
  last_error_at TIMESTAMPTZ,
  error_message TEXT,
  latency_ms INT
);

ALTER TABLE public.provider_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read provider status"
ON public.provider_status FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Admins can manage provider status"
ON public.provider_status FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'));

-- Sync Jobs table
CREATE TABLE public.sync_jobs (
  job_name TEXT PRIMARY KEY,
  last_run_at TIMESTAMPTZ,
  rows_written INT DEFAULT 0,
  status TEXT DEFAULT 'idle',
  error_message TEXT
);

ALTER TABLE public.sync_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read sync jobs"
ON public.sync_jobs FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Admins can manage sync jobs"
ON public.sync_jobs FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'));

-- Subscriptions table for payment tracking
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  plan TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  provider TEXT NOT NULL,
  provider_subscription_id TEXT,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own subscriptions"
ON public.subscriptions FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admins can read all subscriptions"
ON public.subscriptions FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_subscriptions_updated_at
BEFORE UPDATE ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
