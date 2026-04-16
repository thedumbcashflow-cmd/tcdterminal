-- Fix: profiles update policy incorrectly applies to 'public' role instead of 'authenticated'
DROP POLICY IF EXISTS "Users can update own profile safe columns" ON public.profiles;

CREATE POLICY "Users can update own profile safe columns"
ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (
  (id = auth.uid())
  AND (subscription_tier = (SELECT p.subscription_tier FROM public.profiles p WHERE p.id = auth.uid()))
  AND (NOT (trial_ends_at IS DISTINCT FROM (SELECT p.trial_ends_at FROM public.profiles p WHERE p.id = auth.uid())))
);