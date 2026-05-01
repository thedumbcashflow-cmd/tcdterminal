
-- =========================================================
-- 1. Harden has_role: NULL-safe, cannot be bypassed
-- =========================================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN _user_id IS NULL OR _role IS NULL THEN false
    ELSE EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role = _role
    )
  END
$$;

-- =========================================================
-- 2. Admin audit log table
-- =========================================================
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid,
  action text NOT NULL,
  target_table text NOT NULL,
  target_id text,
  old_values jsonb,
  new_values jsonb
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at ON public.admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_actor ON public.admin_audit_log (actor_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_table ON public.admin_audit_log (target_table);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins may read
DROP POLICY IF EXISTS "Admins can read audit log" ON public.admin_audit_log;
CREATE POLICY "Admins can read audit log" ON public.admin_audit_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Block all client writes (only triggers using SECURITY DEFINER may write)
DROP POLICY IF EXISTS "Block client writes audit log" ON public.admin_audit_log;
CREATE POLICY "Block client writes audit log" ON public.admin_audit_log
  AS RESTRICTIVE FOR ALL TO authenticated, anon
  USING (false) WITH CHECK (false);

-- =========================================================
-- 3. Audit trigger functions
-- =========================================================
CREATE OR REPLACE FUNCTION public.audit_user_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.admin_audit_log(actor_user_id, action, target_table, target_id, new_values)
    VALUES (auth.uid(), 'role_grant', 'user_roles', NEW.user_id::text,
      jsonb_build_object('role', NEW.role, 'user_id', NEW.user_id));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.admin_audit_log(actor_user_id, action, target_table, target_id, old_values)
    VALUES (auth.uid(), 'role_revoke', 'user_roles', OLD.user_id::text,
      jsonb_build_object('role', OLD.role, 'user_id', OLD.user_id));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_user_roles ON public.user_roles;
CREATE TRIGGER trg_audit_user_roles
  AFTER INSERT OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.audit_user_roles();

CREATE OR REPLACE FUNCTION public.audit_market_intel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.admin_audit_log(actor_user_id, action, target_table, target_id, new_values)
    VALUES (auth.uid(), 'intel_create', 'market_intel', NEW.id::text,
      jsonb_build_object('asset_symbol', NEW.asset_symbol, 'is_premium', NEW.is_premium, 'intel_type', NEW.intel_type));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.is_premium IS DISTINCT FROM OLD.is_premium OR NEW.intel_type IS DISTINCT FROM OLD.intel_type THEN
      INSERT INTO public.admin_audit_log(actor_user_id, action, target_table, target_id, old_values, new_values)
      VALUES (auth.uid(), 'intel_topic_change', 'market_intel', NEW.id::text,
        jsonb_build_object('is_premium', OLD.is_premium, 'intel_type', OLD.intel_type),
        jsonb_build_object('is_premium', NEW.is_premium, 'intel_type', NEW.intel_type));
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.admin_audit_log(actor_user_id, action, target_table, target_id, old_values)
    VALUES (auth.uid(), 'intel_delete', 'market_intel', OLD.id::text,
      jsonb_build_object('asset_symbol', OLD.asset_symbol, 'is_premium', OLD.is_premium));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_market_intel ON public.market_intel;
CREATE TRIGGER trg_audit_market_intel
  AFTER INSERT OR UPDATE OR DELETE ON public.market_intel
  FOR EACH ROW EXECUTE FUNCTION public.audit_market_intel();

-- =========================================================
-- 4. Restore admin for platform creator (idempotent)
-- =========================================================
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role FROM auth.users WHERE email = 'thedumbcashflow@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

UPDATE public.profiles
SET subscription_tier = 'whale'
WHERE id = (SELECT id FROM auth.users WHERE email = 'thedumbcashflow@gmail.com')
  AND subscription_tier IS DISTINCT FROM 'whale';

-- =========================================================
-- 5. SQL test helper: verify role-table protection
-- Returns a table of {test_name, passed, detail}
-- Admin-only execution.
-- =========================================================
CREATE OR REPLACE FUNCTION public.test_user_roles_protection()
RETURNS TABLE(test_name text, passed boolean, detail text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF NOT public.has_role(v_caller, 'admin') THEN
    RAISE EXCEPTION 'Only admins may execute test_user_roles_protection';
  END IF;

  -- Test 1: NULL inputs to has_role return false
  RETURN QUERY SELECT 'has_role_null_user'::text,
    (public.has_role(NULL, 'admin'::app_role) = false),
    'has_role(NULL, admin) must be false'::text;

  RETURN QUERY SELECT 'has_role_null_role'::text,
    (public.has_role(v_caller, NULL) = false),
    'has_role(uid, NULL) must be false'::text;

  -- Test 2: RESTRICTIVE update policy on user_roles is present
  RETURN QUERY SELECT 'user_roles_no_update_policy'::text,
    EXISTS(
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='user_roles'
        AND cmd='UPDATE' AND permissive='RESTRICTIVE'
    ),
    'RESTRICTIVE UPDATE policy on user_roles must exist'::text;

  -- Test 3: RESTRICTIVE insert/delete admin-gate policies
  RETURN QUERY SELECT 'user_roles_restrictive_insert'::text,
    EXISTS(
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='user_roles'
        AND cmd='INSERT' AND permissive='RESTRICTIVE'
    ),
    'RESTRICTIVE INSERT policy on user_roles must exist'::text;

  RETURN QUERY SELECT 'user_roles_restrictive_delete'::text,
    EXISTS(
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='user_roles'
        AND cmd='DELETE' AND permissive='RESTRICTIVE'
    ),
    'RESTRICTIVE DELETE policy on user_roles must exist'::text;

  -- Test 4: audit triggers exist
  RETURN QUERY SELECT 'audit_trigger_user_roles'::text,
    EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='trg_audit_user_roles'),
    'Audit trigger on user_roles must exist'::text;

  RETURN QUERY SELECT 'audit_trigger_market_intel'::text,
    EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='trg_audit_market_intel'),
    'Audit trigger on market_intel must exist'::text;

  -- Test 5: platform creator has admin role
  RETURN QUERY SELECT 'creator_has_admin'::text,
    EXISTS(
      SELECT 1 FROM public.user_roles ur
      JOIN auth.users u ON u.id = ur.user_id
      WHERE u.email = 'thedumbcashflow@gmail.com' AND ur.role = 'admin'
    ),
    'thedumbcashflow@gmail.com must have admin role'::text;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.test_user_roles_protection() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.test_user_roles_protection() TO authenticated;
