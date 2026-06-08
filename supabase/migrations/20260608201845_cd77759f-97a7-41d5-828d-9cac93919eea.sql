-- Restrict provider_status and sync_jobs reads to admin/moderator authenticated users only
DROP POLICY IF EXISTS "provider_status_authenticated_admin_only" ON public.provider_status;
CREATE POLICY "provider_status_authenticated_admin_only"
  ON public.provider_status AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

DROP POLICY IF EXISTS "sync_jobs_authenticated_admin_only" ON public.sync_jobs;
CREATE POLICY "sync_jobs_authenticated_admin_only"
  ON public.sync_jobs AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

-- Block anonymous realtime subscribers from receiving market_intel broadcasts
DROP POLICY IF EXISTS "block_anon_market_intel_realtime" ON realtime.messages;
CREATE POLICY "block_anon_market_intel_realtime"
  ON realtime.messages AS RESTRICTIVE
  FOR SELECT TO anon
  USING (false);
