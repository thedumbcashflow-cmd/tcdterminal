import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";

const ExpiredTrialOverlay = () => {
  const navigate = useNavigate();
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="max-w-sm border border-zinc-700 bg-zinc-900 rounded-xl p-8 text-center">
        <Lock className="h-8 w-8 text-zinc-500 mx-auto mb-4" />
        <h2 className="font-semibold text-lg text-zinc-50">Your 14-day trial has ended</h2>
        <p className="font-mono text-xs text-zinc-400 mt-2">
          You had full Pro access during your trial. Upgrade to restore whale flows, liquidation data, and AI briefs.
        </p>
        <button
          onClick={() => navigate("/pricing?trial=expired")}
          className="bg-green-500 text-black font-mono text-sm px-6 py-2.5 rounded-md mt-6 hover:bg-green-400 transition-colors"
        >
          See Plans
        </button>
        <p className="font-mono text-[10px] text-zinc-600 mt-3">
          Questions? Contact support
        </p>
      </div>
    </div>
  );
};

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
          <div className="mt-2 font-mono text-xs text-muted-foreground animate-pulse">
            INITIALIZING TERMINAL...
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Show expired trial overlay (except on pricing/checkout/settings)
  if (
    trialExpired &&
    !location.pathname.startsWith("/pricing") &&
    !location.pathname.startsWith("/checkout") &&
    !location.pathname.startsWith("/settings")
  ) {
    return (
      <>
        {children}
        <ExpiredTrialOverlay />
      </>
    );
  }

  return <>{children}</>;
};

export default AuthGuard;
