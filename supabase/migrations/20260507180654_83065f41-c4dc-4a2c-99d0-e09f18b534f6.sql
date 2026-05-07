-- 1) Remove admin_audit_log from realtime publication so audit row changes
--    are no longer broadcast to all authenticated subscribers.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='admin_audit_log'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.admin_audit_log';
  END IF;
END $$;

-- 2) Explicitly revoke anon access to operational tables to defend in depth
--    against any default public-schema grants. Authenticated stays governed by RLS.
REVOKE ALL ON public.provider_status FROM anon, PUBLIC;
REVOKE ALL ON public.sync_jobs       FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_status TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sync_jobs       TO authenticated;

-- 3) Lock down internal SECURITY DEFINER test helper - admins only, not callable by signed-in users via PostgREST.
REVOKE EXECUTE ON FUNCTION public.test_user_roles_protection() FROM PUBLIC, anon, authenticated;
-- (Function still callable by service_role / superuser when needed.)