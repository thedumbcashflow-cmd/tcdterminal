-- 1. Defense-in-depth: explicit restrictive policy blocking UPDATE on user_roles for everyone.
-- Admins manage roles via INSERT/DELETE only; UPDATE is never required.
CREATE POLICY "No one can update roles"
ON public.user_roles
AS RESTRICTIVE
FOR UPDATE
TO authenticated, anon
USING (false)
WITH CHECK (false);

-- 2. Lock down SECURITY DEFINER functions: revoke EXECUTE from anon/authenticated/public.
-- These functions are used by RLS policies and triggers (which run with definer privileges)
-- and should not be invokable directly via PostgREST RPC.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_subscription_tier(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_tier_self_modification() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_watchlist_limit() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;