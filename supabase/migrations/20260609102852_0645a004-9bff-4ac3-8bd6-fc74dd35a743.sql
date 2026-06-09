-- 1) Trial: 14d -> 7d
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name, subscription_tier, trial_ends_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    'pro',
    now() + interval '7 days'
  );
  RETURN NEW;
END;
$$;

-- 2) Sovereign Titan applications
CREATE TABLE IF NOT EXISTS public.sovereign_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  applicant_name text NOT NULL,
  fund_name text NOT NULL,
  aum_bracket text NOT NULL,
  contact_email text NOT NULL,
  message text,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sovereign_app_status_chk CHECK (status IN ('pending','contacted','approved','rejected'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sovereign_applications TO authenticated;
GRANT ALL ON public.sovereign_applications TO service_role;

ALTER TABLE public.sovereign_applications ENABLE ROW LEVEL SECURITY;

-- Authenticated user can insert (and only as themselves or anonymous-tied via user_id null is disallowed)
CREATE POLICY "Authenticated users can submit sovereign applications"
ON public.sovereign_applications FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL AND (user_id IS NULL OR user_id = auth.uid()));

-- Applicants can see their own submissions
CREATE POLICY "Applicants can view their own submissions"
ON public.sovereign_applications FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Only admins can update / delete
CREATE POLICY "Admins can update sovereign applications"
ON public.sovereign_applications FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete sovereign applications"
ON public.sovereign_applications FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_sovereign_apps_updated_at
BEFORE UPDATE ON public.sovereign_applications
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
