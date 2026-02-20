
-- Create user_watchlist table for 5-company limit enforcement
CREATE TABLE public.user_watchlist (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  item_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, item_id)
);

ALTER TABLE public.user_watchlist ENABLE ROW LEVEL SECURITY;

-- Users can read own watchlist
CREATE POLICY "Users can read own watchlist"
ON public.user_watchlist
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Users can insert into own watchlist (max 5 enforced by trigger)
CREATE POLICY "Users can insert own watchlist"
ON public.user_watchlist
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Users can delete from own watchlist
CREATE POLICY "Users can delete own watchlist"
ON public.user_watchlist
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- Trigger function to enforce 5-item limit for free users
CREATE OR REPLACE FUNCTION public.enforce_watchlist_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_count INT;
  user_tier subscription_tier;
BEGIN
  SELECT get_subscription_tier(NEW.user_id) INTO user_tier;
  
  -- Only enforce limit for free tier
  IF user_tier = 'free' THEN
    SELECT COUNT(*) INTO current_count
    FROM public.user_watchlist
    WHERE user_id = NEW.user_id;
    
    IF current_count >= 5 THEN
      RAISE EXCEPTION 'Free tier limited to 5 watchlist items. Upgrade to add more.';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER check_watchlist_limit
BEFORE INSERT ON public.user_watchlist
FOR EACH ROW
EXECUTE FUNCTION public.enforce_watchlist_limit();
