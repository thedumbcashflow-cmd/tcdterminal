CREATE TABLE IF NOT EXISTS public.payment_webhook_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id text,
  order_id text,
  paypal_event text,
  caller_user_id uuid,
  status text NOT NULL,
  http_status int,
  error_code text,
  error_message text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.payment_webhook_log TO authenticated;
GRANT ALL ON public.payment_webhook_log TO service_role;

ALTER TABLE public.payment_webhook_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read payment_webhook_log"
ON public.payment_webhook_log FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS payment_webhook_log_order_idx ON public.payment_webhook_log(order_id);
CREATE INDEX IF NOT EXISTS payment_webhook_log_created_idx ON public.payment_webhook_log(created_at DESC);

ALTER TABLE public.sovereign_applications
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_error text,
  ADD COLUMN IF NOT EXISTS email_message_id text;