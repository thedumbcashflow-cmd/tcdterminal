
-- Fix feature_requests RLS: change from RESTRICTIVE to PERMISSIVE
DROP POLICY IF EXISTS "Admins can read all feature requests" ON public.feature_requests;
DROP POLICY IF EXISTS "Users can read own feature requests" ON public.feature_requests;
DROP POLICY IF EXISTS "Admins can update feature requests" ON public.feature_requests;
DROP POLICY IF EXISTS "Paid users or admins can create feature requests" ON public.feature_requests;

CREATE POLICY "Admins can read all feature requests"
ON public.feature_requests FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can read own feature requests"
ON public.feature_requests FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admins can update feature requests"
ON public.feature_requests FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Paid users or admins can create feature requests"
ON public.feature_requests FOR INSERT TO authenticated
WITH CHECK (
  (user_id = auth.uid()) AND (
    (public.get_subscription_tier(auth.uid()) = ANY (ARRAY['pro'::subscription_tier, 'whale'::subscription_tier]))
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
);

-- Fix market_intel SELECT RLS (also was restrictive)
DROP POLICY IF EXISTS "Authenticated users can read market intel based on tier" ON public.market_intel;
DROP POLICY IF EXISTS "Admins can delete market intel" ON public.market_intel;
DROP POLICY IF EXISTS "Admins can insert market intel" ON public.market_intel;
DROP POLICY IF EXISTS "Admins can update market intel" ON public.market_intel;

CREATE POLICY "Authenticated users can read market intel based on tier"
ON public.market_intel FOR SELECT TO authenticated
USING ((is_premium = false) OR (public.get_subscription_tier(auth.uid()) = ANY (ARRAY['pro'::subscription_tier, 'whale'::subscription_tier])) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage market intel"
ON public.market_intel FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Add display_name and timezone to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'UTC';
