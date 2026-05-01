-- Defense-in-depth: restrictive policy ensures NO non-admin can insert into user_roles,
-- even if a future permissive policy is added by mistake. Restrictive policies AND
-- with all permissive policies, so this acts as a hard floor.
CREATE POLICY "Restrict role inserts to admins only"
ON public.user_roles
AS RESTRICTIVE
FOR INSERT
TO authenticated, anon
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Also restrict DELETE the same way for symmetry against privilege escalation via deletion.
CREATE POLICY "Restrict role deletes to admins only"
ON public.user_roles
AS RESTRICTIVE
FOR DELETE
TO authenticated, anon
USING (public.has_role(auth.uid(), 'admin'::app_role));