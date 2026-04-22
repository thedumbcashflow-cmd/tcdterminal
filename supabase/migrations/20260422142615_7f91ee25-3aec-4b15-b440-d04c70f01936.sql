-- Defense-in-depth: enforce subscription_tier and trial_ends_at immutability via trigger
-- Only service role / SECURITY DEFINER functions can modify these fields.
CREATE OR REPLACE FUNCTION public.prevent_tier_self_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow when the caller is the service role (bypasses RLS) — auth.uid() will be NULL
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- For authenticated users updating their own row, lock down sensitive columns
  IF NEW.id = auth.uid() THEN
    IF NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier THEN
      RAISE EXCEPTION 'subscription_tier cannot be modified by user';
    END IF;
    IF NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at THEN
      RAISE EXCEPTION 'trial_ends_at cannot be modified by user';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_prevent_tier_self_modification ON public.profiles;
CREATE TRIGGER profiles_prevent_tier_self_modification
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_tier_self_modification();