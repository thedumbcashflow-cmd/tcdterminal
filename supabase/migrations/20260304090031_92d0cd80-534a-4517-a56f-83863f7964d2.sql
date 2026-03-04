
-- Fix feature_requests RLS: change RESTRICTIVE to PERMISSIVE
DROP POLICY IF EXISTS "Paid admins can read all feature requests" ON public.feature_requests;
DROP POLICY IF EXISTS "Paid admins can update feature requests" ON public.feature_requests;
DROP POLICY IF EXISTS "Users can create own feature requests" ON public.feature_requests;
DROP POLICY IF EXISTS "Users can read own feature requests" ON public.feature_requests;

-- Recreate as PERMISSIVE
CREATE POLICY "Admins can read all feature requests"
ON public.feature_requests FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update feature requests"
ON public.feature_requests FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can read own feature requests"
ON public.feature_requests FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Paid users can create feature requests"
ON public.feature_requests FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid() 
  AND get_subscription_tier(auth.uid()) IN ('pro'::subscription_tier, 'whale'::subscription_tier)
);
