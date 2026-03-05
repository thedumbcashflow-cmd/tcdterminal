import { useSubscriptionTier } from "@/hooks/useSubscriptionTier";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import TerminalSidebar from "@/components/TerminalSidebar";
import TopBar from "@/components/TopBar";
import { Lock, ExternalLink, RefreshCw, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface MacroSnapshot {
  fearGreed: { value: number; label: string; source: string };
  btcDominance: { value: number; source: string };
  dollarIndex: { value: number; label: string; source: string };
  updatedAt: string;
  stale: boolean;
}

const WorldMonitor = () => {
  const navigate = useNavigate();
  const { isPro, loading } = useSubscriptionTier();
  const [macro, setMacro] = useState<MacroSnapshot | null>(null);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMacro = async () => {
    setFetching(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("macro-snapshot");
      if (fnError) throw fnError;
      setMacro(data as MacroSnapshot);
    } catch (e: any) {
      setError(e.message || "Failed to fetch macro data");
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    if (isPro && !loading) {
      fetchMacro();
      const interval = setInterval(fetchMacro, 60_000);
      return () => clearInterval(interval);
    }
  }, [isPro, loading]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="font-serif text-lg font-bold text-primary animate-pulse">◆ TCD</div>
      </div>
    );
  }

  const fngColor = (v: number) => v >= 60 ? "text-terminal-green" : v >= 40 ? "text-yellow-500" : "text-terminal-red";

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
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="font-serif text-xl font-bold text-primary mb-1">◆ World Monitor</h1>
                  <p className="text-xs text-muted-foreground">Global macro intelligence overlay for Solana operators</p>
                </div>
                <button
                  onClick={fetchMacro}
                  disabled={fetching}
                  className="flex items-center gap-1 border border-border px-2 py-1 text-[10px] text-muted-foreground hover:text-primary transition-colors"
                >
                  <RefreshCw className={`h-3 w-3 ${fetching ? "animate-spin" : ""}`} />
                  Refresh
                </button>
              </div>

              {macro?.stale && (
                <div className="flex items-center gap-2 border border-yellow-500/30 bg-yellow-500/5 px-3 py-1.5 text-[10px] text-yellow-500">
                  <AlertTriangle className="h-3 w-3" />
                  Some providers degraded — showing last known good values
                </div>
              )}

              {error && !macro && (
                <div className="border border-terminal-red/30 bg-terminal-red/5 px-3 py-2 text-xs text-terminal-red">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="border border-border bg-card p-4">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">US Fear & Greed</span>
                  <div className={`font-data text-3xl font-bold mt-1 ${macro ? fngColor(macro.fearGreed.value) : "text-foreground"}`}>
                    {macro ? macro.fearGreed.value : "—"}
                  </div>
                  <span className="text-xs text-muted-foreground">{macro?.fearGreed.label || "Loading..."}</span>
                  {macro && <div className="mt-1 text-[9px] text-muted-foreground/60">via {macro.fearGreed.source}</div>}
                </div>

                <div className="border border-border bg-card p-4">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">DXY Index (Proxy)</span>
                  <div className="font-data text-3xl font-bold text-foreground mt-1">
                    {macro ? macro.dollarIndex.value : "—"}
                  </div>
                  <span className="text-xs text-muted-foreground">{macro?.dollarIndex.label || "Loading..."}</span>
                  {macro && <div className="mt-1 text-[9px] text-muted-foreground/60">via {macro.dollarIndex.source}</div>}
                </div>

                <div className="border border-border bg-card p-4">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">BTC Dominance</span>
                  <div className="font-data text-3xl font-bold text-primary mt-1">
                    {macro ? `${macro.btcDominance.value}%` : "—"}
                  </div>
                  <span className="text-xs text-muted-foreground">{macro ? "Global market share" : "Loading..."}</span>
                  {macro && <div className="mt-1 text-[9px] text-muted-foreground/60">via {macro.btcDominance.source}</div>}
                </div>
              </div>

              {macro && (
                <div className="text-[10px] text-muted-foreground/60 text-right">
                  Last updated: {new Date(macro.updatedAt).toLocaleTimeString()} UTC
                </div>
              )}

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
