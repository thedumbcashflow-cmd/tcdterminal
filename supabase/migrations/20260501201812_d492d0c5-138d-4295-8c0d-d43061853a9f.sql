-- Revoke EXECUTE from the test function (was the only SECURITY DEFINER still callable by authenticated)
REVOKE EXECUTE ON FUNCTION public.test_user_roles_protection() FROM PUBLIC, anon, authenticated;

-- Enable realtime broadcasting on admin_audit_log so admin clients can subscribe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='admin_audit_log'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_audit_log';
  END IF;
END $$;

-- Ensure full row payloads on changes
ALTER TABLE public.admin_audit_log REPLICA IDENTITY FULL;