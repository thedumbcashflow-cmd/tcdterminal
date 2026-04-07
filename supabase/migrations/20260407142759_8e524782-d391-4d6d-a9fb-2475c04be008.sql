
-- 1. FIX: Privilege escalation — restrict profile updates to safe columns only
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can update own profile safe columns"
ON public.profiles
FOR UPDATE
USING (id = auth.uid())
WITH CHECK (
  id = auth.uid()
  AND subscription_tier = (SELECT subscription_tier FROM public.profiles WHERE id = auth.uid())
  AND trial_ends_at IS NOT DISTINCT FROM (SELECT trial_ends_at FROM public.profiles WHERE id = auth.uid())
);

-- 2. FIX: Sync jobs — remove broad read policy, keep admin-only
DROP POLICY IF EXISTS "Authenticated can read sync jobs" ON public.sync_jobs;

-- 3. FIX: Provider status — also restrict to admin-only (contains internal system data)
DROP POLICY IF EXISTS "Authenticated can read provider status" ON public.provider_status;

-- 4. FIX: Realtime messages — restrict channel subscriptions
-- Add RLS policies on realtime.messages to prevent unauthorized channel access
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only paid users receive premium realtime data"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  (realtime.topic() NOT LIKE 'premium:%')
  OR (get_subscription_tier(auth.uid()) = ANY (ARRAY['pro'::subscription_tier, 'whale'::subscription_tier]))
  OR has_role(auth.uid(), 'admin'::app_role)
);
