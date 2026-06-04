REVOKE EXECUTE ON FUNCTION public.purge_old_proxy_logs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_old_proxy_logs() TO service_role;