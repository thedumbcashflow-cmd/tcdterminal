ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trial_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS subscribed_at timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_period text;

-- Keep these billing columns server-managed: users may not edit them.
CREATE OR REPLACE FUNCTION public.prevent_tier_self_modification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.id = auth.uid() THEN
    IF NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier THEN
      RAISE EXCEPTION 'subscription_tier cannot be modified by user';
    END IF;
    IF NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at THEN
      RAISE EXCEPTION 'trial_ends_at cannot be modified by user';
    END IF;
    IF NEW.trial_started_at IS DISTINCT FROM OLD.trial_started_at THEN
      RAISE EXCEPTION 'trial_started_at cannot be modified by user';
    END IF;
    IF NEW.subscribed_at IS DISTINCT FROM OLD.subscribed_at THEN
      RAISE EXCEPTION 'subscribed_at cannot be modified by user';
    END IF;
    IF NEW.subscription_period IS DISTINCT FROM OLD.subscription_period THEN
      RAISE EXCEPTION 'subscription_period cannot be modified by user';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;