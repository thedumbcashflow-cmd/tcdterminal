-- Revoke direct EXECUTE on SECURITY DEFINER trigger / audit helpers from clients.
-- These are invoked by triggers / RLS internally; they should never be callable via PostgREST.
REVOKE EXECUTE ON FUNCTION public.handle_new_user()              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column()     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_user_roles()             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_market_intel()           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_tier_self_modification() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_watchlist_limit()      FROM PUBLIC, anon, authenticated;
-- has_role(uuid, app_role) and get_subscription_tier(uuid) intentionally remain executable:
-- they are called by client RPC and by RLS policies.