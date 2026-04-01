import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

interface TrialStatus {
  tier: string;
  trialEndsAt: string | null;
  daysRemaining: number;
  isTrialActive: boolean;
  isExpired: boolean;
}

export function useSubscription() {
  const { user } = useAuth();
  const [trial, setTrial] = useState<TrialStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const fetch = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("subscription_tier, trial_ends_at")
        .eq("id", user.id)
        .maybeSingle();

      if (!data) {
        setTrial({ tier: "free", trialEndsAt: null, daysRemaining: 0, isTrialActive: false, isExpired: false });
        setLoading(false);
        return;
      }

      const now = new Date();
      const trialEnd = data.trial_ends_at ? new Date(data.trial_ends_at) : null;
      const daysRemaining = trialEnd ? Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))) : 0;
      const isTrialActive = data.subscription_tier === "pro" && !!trialEnd && trialEnd > now;
      const isExpired = data.subscription_tier === "free" && !!data.trial_ends_at && trialEnd! < now;

      setTrial({
        tier: data.subscription_tier,
        trialEndsAt: data.trial_ends_at,
        daysRemaining,
        isTrialActive,
        isExpired,
      });
      setLoading(false);
    };

    fetch();
  }, [user]);

  const isPro = trial?.tier === "pro" || trial?.tier === "whale";
  const isWhale = trial?.tier === "whale";
  const isExpired = trial?.isExpired ?? false;
  const daysLeft = trial?.daysRemaining ?? 0;

  return { trial, loading, isPro, isWhale, isExpired, daysLeft };
}
