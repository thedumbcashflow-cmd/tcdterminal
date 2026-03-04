
-- Allow admins to insert feature requests regardless of tier
DROP POLICY IF EXISTS "Paid users can create feature requests" ON public.feature_requests;
CREATE POLICY "Paid users or admins can create feature requests"
ON public.feature_requests FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid() 
  AND (
    get_subscription_tier(auth.uid()) IN ('pro'::subscription_tier, 'whale'::subscription_tier)
    OR has_role(auth.uid(), 'admin'::app_role)
  )
);
