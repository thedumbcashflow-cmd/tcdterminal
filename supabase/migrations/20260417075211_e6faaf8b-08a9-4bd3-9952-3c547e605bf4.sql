
CREATE POLICY "Moderators can manage market intel" ON public.market_intel FOR ALL TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role)) WITH CHECK (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can read all profiles" ON public.profiles FOR SELECT TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can read all roles" ON public.user_roles FOR SELECT TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can read all feature requests" ON public.feature_requests FOR SELECT TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can update feature requests" ON public.feature_requests FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can read sync jobs" ON public.sync_jobs FOR SELECT TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can read provider status" ON public.provider_status FOR SELECT TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can read all subscriptions" ON public.subscriptions FOR SELECT TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));
