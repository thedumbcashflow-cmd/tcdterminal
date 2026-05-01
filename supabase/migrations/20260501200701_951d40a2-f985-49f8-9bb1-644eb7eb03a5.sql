
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_user_roles() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_market_intel() FROM PUBLIC, anon, authenticated;
-- Keep test_user_roles_protection callable by signed-in users (it self-checks for admin role internally)
-- but block anon
REVOKE EXECUTE ON FUNCTION public.test_user_roles_protection() FROM PUBLIC, anon;
