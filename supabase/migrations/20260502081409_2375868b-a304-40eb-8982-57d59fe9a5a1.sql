-- 1) Restore EXECUTE on helpers used by client + RLS policies
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_subscription_tier(uuid) TO authenticated;

-- Keep trigger-only audit functions hidden from clients
REVOKE EXECUTE ON FUNCTION public.audit_user_roles() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_market_intel() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.test_user_roles_protection() FROM PUBLIC, anon, authenticated;

-- 2) Fix admin_audit_log policies: dedicated admin-only read + write-blocking only
DROP POLICY IF EXISTS "Block client writes audit log" ON public.admin_audit_log;
DROP POLICY IF EXISTS "Admins can read audit log" ON public.admin_audit_log;

-- Admin-only read (no moderator path)
CREATE POLICY "admin_audit_log_read"
  ON public.admin_audit_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Block client INSERT/UPDATE/DELETE explicitly. SECURITY DEFINER triggers
-- still write because they bypass RLS.
CREATE POLICY "admin_audit_log_block_insert"
  ON public.admin_audit_log
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (false);

CREATE POLICY "admin_audit_log_block_update"
  ON public.admin_audit_log
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

CREATE POLICY "admin_audit_log_block_delete"
  ON public.admin_audit_log
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated, anon
  USING (false);

-- 3) Re-confirm creator admin + whale tier (idempotent)
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role
FROM auth.users
WHERE lower(email) = 'thedumbcashflow@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

UPDATE public.profiles
SET subscription_tier = 'whale'::public.subscription_tier
WHERE id = (SELECT id FROM auth.users WHERE lower(email) = 'thedumbcashflow@gmail.com')
  AND subscription_tier IS DISTINCT FROM 'whale'::public.subscription_tier;
