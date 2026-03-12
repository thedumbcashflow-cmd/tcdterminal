import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const AuthGuard = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [trialExpired, setTrialExpired] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!user) {
      setChecking(false);
      return;
    }

    const checkTrial = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("subscription_tier, trial_ends_at")
        .eq("id", user.id)
        .maybeSingle() as { data: { subscription_tier: string; trial_ends_at: string | null } | null };

      if (
        data?.subscription_tier === "free" &&
        data?.trial_ends_at &&
        new Date(data.trial_ends_at) < new Date()
      ) {
        setTrialExpired(true);
      } else {
        setTrialExpired(false);
      }
      setChecking(false);
    };

    checkTrial();
  }, [user]);

  if (loading || checking) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="font-serif text-lg font-bold text-primary">◆ TCD</div>
          <div className="mt-2 font-data text-xs text-muted-foreground animate-pulse">
            INITIALIZING TERMINAL...
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Redirect expired trial users to pricing (unless already on pricing/checkout)
  if (
    trialExpired &&
    !location.pathname.startsWith("/pricing") &&
    !location.pathname.startsWith("/checkout") &&
    !location.pathname.startsWith("/settings")
  ) {
    return <Navigate to="/pricing?trial=expired" replace />;
  }

  return <>{children}</>;
};

export default AuthGuard;
