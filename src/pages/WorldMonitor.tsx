import { useSubscriptionTier } from "@/hooks/useSubscriptionTier";
import { useNavigate } from "react-router-dom";
import TerminalSidebar from "@/components/TerminalSidebar";
import TopBar from "@/components/TopBar";
import { Lock, ExternalLink } from "lucide-react";

const WorldMonitor = () => {
  const navigate = useNavigate();
  const { isPro, loading } = useSubscriptionTier();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="font-serif text-lg font-bold text-primary animate-pulse">◆ TCD</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <TerminalSidebar activeItem="world-monitor" />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <div className="flex-1 overflow-auto p-4 md:p-6">
          {!isPro ? (
            <div className="flex flex-col items-center justify-center h-full">
              <Lock className="h-8 w-8 text-muted-foreground mb-3" />
              <h2 className="font-serif text-lg font-bold text-foreground">Terminal Access Restricted</h2>
              <p className="mt-2 text-sm text-muted-foreground text-center max-w-sm">
                World Monitor requires a PRO or WHALE subscription.
              </p>
              <button
                onClick={() => navigate("/pricing?return=/world-monitor")}
                className="mt-4 border border-primary bg-primary/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-primary hover:bg-primary/20 transition-colors"
              >
                Upgrade Plan
              </button>
            </div>
          ) : (
            <div className="mx-auto max-w-5xl space-y-4">
              <div>
                <h1 className="font-serif text-xl font-bold text-primary mb-1">◆ World Monitor</h1>
                <p className="text-xs text-muted-foreground">Global macro intelligence overlay for Solana operators</p>
              </div>

              {/* Placeholder for World Monitor integration */}
              <div className="border border-border bg-card p-8 text-center">
                <p className="text-sm text-muted-foreground">
                  World Monitor integration active. Real-time global macro signals loading...
                </p>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[
                    { label: "US Fear & Greed", value: "—", status: "Connecting..." },
                    { label: "DXY Index", value: "—", status: "Connecting..." },
                    { label: "BTC Dominance", value: "—", status: "Connecting..." },
                  ].map((item) => (
                    <div key={item.label} className="border border-border p-3">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{item.label}</span>
                      <div className="font-data text-xl font-bold text-foreground mt-1">{item.value}</div>
                      <span className="text-[9px] text-muted-foreground">{item.status}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* AGPL Legal Notice */}
              <div className="border border-border bg-card/50 p-4 text-[10px] text-muted-foreground space-y-1">
                <p className="font-bold uppercase tracking-wider">Open Source Notice</p>
                <p>World Monitor — Copyright © 2024–2026 Elie Habib</p>
                <p>Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0)</p>
                <p>
                  Under the terms of the AGPL, you have the right to access the source code of this component as deployed.
                </p>
                <a
                  href="https://github.com/AviMehta90/World-Monitor"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline mt-1"
                >
                  <ExternalLink className="h-3 w-3" />
                  View Source Code (AGPL-3.0)
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WorldMonitor;
