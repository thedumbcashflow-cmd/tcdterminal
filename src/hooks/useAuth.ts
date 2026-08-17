import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invalidateSubscriptionCache } from "./useSubscriptionTier";
import type { User, Session, AuthError } from "@supabase/supabase-js";

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AuthError | null>(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // Any identity change must drop cached tier/profile data so a stale
        // tier is never rendered for the next user.
        if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
          invalidateSubscriptionCache();
        }
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) setError(error);
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) setError(error);
    invalidateSubscriptionCache();
  };

  return { user, session, loading, error, signOut };
};
