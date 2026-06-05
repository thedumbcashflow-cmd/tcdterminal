
-- 1) Block anon access to operational tables
REVOKE ALL ON public.provider_status FROM anon;
REVOKE ALL ON public.sync_jobs FROM anon;

DROP POLICY IF EXISTS "Block anon access to provider_status" ON public.provider_status;
CREATE POLICY "Block anon access to provider_status"
  ON public.provider_status
  AS RESTRICTIVE
  FOR SELECT
  TO anon
  USING (false);

DROP POLICY IF EXISTS "Block anon access to sync_jobs" ON public.sync_jobs;
CREATE POLICY "Block anon access to sync_jobs"
  ON public.sync_jobs
  AS RESTRICTIVE
  FOR SELECT
  TO anon
  USING (false);

-- 2) Restrict realtime broadcasts of admin_audit_log to admins only.
-- realtime.messages governs which topics a client may subscribe to.
DROP POLICY IF EXISTS "Admins only can subscribe to admin_audit_log realtime" ON realtime.messages;
CREATE POLICY "Admins only can subscribe to admin_audit_log realtime"
  ON realtime.messages
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    -- Block any postgres_changes topic referencing admin_audit_log for non-admins.
    CASE
      WHEN COALESCE(realtime.topic(), '') ILIKE '%admin_audit_log%'
        THEN public.has_role(auth.uid(), 'admin'::public.app_role)
      ELSE true
    END
  );
