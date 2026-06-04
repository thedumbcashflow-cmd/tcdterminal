CREATE TABLE public.proxy_request_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  req_id text NOT NULL,
  user_id uuid,
  path text NOT NULL,
  payload jsonb,
  status int,
  latency_ms int,
  upstream_snippet text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_proxy_request_log_req_id ON public.proxy_request_log(req_id);
CREATE INDEX idx_proxy_request_log_created_at ON public.proxy_request_log(created_at DESC);

GRANT SELECT ON public.proxy_request_log TO authenticated;
GRANT ALL ON public.proxy_request_log TO service_role;

ALTER TABLE public.proxy_request_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read proxy request log"
  ON public.proxy_request_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Block writes to proxy_request_log"
  ON public.proxy_request_log AS RESTRICTIVE FOR ALL
  TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.purge_old_proxy_logs()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.proxy_request_log WHERE created_at < now() - interval '7 days';
$$;