import { useSubscriptionTier } from "@/hooks/useSubscriptionTier";
import { useNavigate } from "react-router-dom";
import { useState, useEffect, useMemo } from "react";
import TerminalSidebar from "@/components/TerminalSidebar";
import TopBar from "@/components/TopBar";
import { Lock, ExternalLink, RefreshCw, AlertTriangle, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from "recharts";

interface SeriesPoint { t: number; v: number }
interface MacroSnapshot {
  fearGreed: { value: number; label: string; source: string; history?: SeriesPoint[] };
  btcDominance: { value: number; source: string; history?: SeriesPoint[] };
  dollarIndex: { value: number; label: string; source: string; history?: SeriesPoint[] };
  updatedAt: string;
  stale: boolean;
}

const fngColor = (v: number) =>
  v >= 75 ? "text-terminal-green"
  : v >= 55 ? "text-emerald-400"
  : v >= 45 ? "text-yellow-500"
  : v >= 25 ? "text-orange-500"
  : "text-terminal-red";

const fngRegime = (v: number) =>
  v >= 75 ? "Extreme Greed"
  : v >= 55 ? "Greed"
  : v >= 45 ? "Neutral"
  : v >= 25 ? "Fear"
  : "Extreme Fear";

function pctChange(history?: SeriesPoint[]) {
  if (!history || history.length < 2) return null;
  const first = history[0].v;
  const last = history[history.length - 1].v;
  if (!first) return null;
  return ((last - first) / first) * 100;
}

function trendOf(delta: number | null) {
  if (delta == null) return { Icon: Minus, cls: "text-muted-foreground", label: "—" };
  if (delta > 0.5) return { Icon: TrendingUp, cls: "text-terminal-green", label: `+${delta.toFixed(2)}%` };
  if (delta < -0.5) return { Icon: TrendingDown, cls: "text-terminal-red", label: `${delta.toFixed(2)}%` };
  return { Icon: Minus, cls: "text-muted-foreground", label: `${delta.toFixed(2)}%` };
}

function MacroChart({
  data,
  color,
  domain,
  refLines,
}: {
  data: SeriesPoint[];
  color: string;
  domain?: [number | "auto", number | "auto"];
  refLines?: { y: number; label?: string; color?: string }[];
}) {
  if (!data || data.length < 2) {
    return <div className="h-32 flex items-center justify-center text-[10px] text-muted-foreground">No history</div>;
  }
  const id = `g-${color.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <div className="h-32 -mx-1">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.45} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="t" hide />
          <YAxis domain={domain ?? ["auto", "auto"]} hide />
          {refLines?.map((r, i) => (
            <ReferenceLine key={i} y={r.y} stroke={r.color ?? "hsl(var(--border))"} strokeDasharray="2 3" strokeOpacity={0.5} />
          ))}
          <Tooltip
            contentStyle={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              fontSize: "10px",
              padding: "4px 8px",
            }}
            labelFormatter={(t) => new Date(Number(t)).toLocaleDateString()}
            formatter={(v: number) => [v.toFixed(2), "Value"]}
          />
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={`url(#${id})`} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function fngIntel(v: number) {
  if (v >= 75) return {
    headline: "Crowd is euphoric — late-cycle distribution risk for SOL longs.",
    bullets: [
      "Reduce leverage; tighten trailing stops on memecoin and high-beta SOL plays.",
      "Whale wallets historically distribute into Extreme Greed prints.",
      "Watch for funding-rate divergence on SOL perps as a top signal.",
    ],
  };
  if (v >= 55) return {
    headline: "Risk-on tape; SOL beta typically outperforms BTC in this regime.",
    bullets: [
      "Trend-following entries favored; rotate into liquid majors and SOL DeFi.",
      "Monitor BTC dominance — falling DOM + Greed = altseason fuel.",
    ],
  };
  if (v >= 45) return {
    headline: "Neutral indecision — wait for confirmation, avoid overtrading.",
    bullets: [
      "Range-trade liquid SOL pairs; reduce position sizing.",
      "Catalysts (CPI, FOMC, ETF flows) will likely break the range.",
    ],
  };
  if (v >= 25) return {
    headline: "Fear regime — historically a constructive accumulation window.",
    bullets: [
      "DCA quality SOL infra/L1 exposure; avoid catching falling memecoins.",
      "Watch for capitulation wicks on SOL spot to confirm a local bottom.",
    ],
  };
  return {
    headline: "Extreme Fear — generational entries often print here.",
    bullets: [
      "Highest historical 90-day forward returns for SOL begin in this band.",
      "Liquidity is thin — scale in over 5–10 tranches.",
      "Track stablecoin inflows to Solana as a leading reversal signal.",
    ],
  };
}

function dxyIntel(v: number, delta: number | null) {
  const rising = (delta ?? 0) > 0.5;
  const falling = (delta ?? 0) < -0.5;
  return {
    headline: rising
      ? "Strong dollar = headwind for SOL and risk crypto."
      : falling
      ? "Weakening dollar = liquidity tailwind for SOL and altcoins."
      : "Dollar is range-bound — crypto follows idiosyncratic catalysts.",
    bullets: [
      "DXY > 105 historically correlates with crypto drawdowns (-12% avg).",
      "DXY < 100 has preceded every major SOL bull leg since 2020.",
      `Current proxy at ${v.toFixed(1)} — ${v > 105 ? "elevated" : v > 100 ? "neutral" : "supportive"} for risk assets.`,
      "Monitor 2Y UST yields alongside DXY for a fuller liquidity picture.",
    ],
  };
}

function btcDomIntel(v: number, delta: number | null) {
  const rising = (delta ?? 0) > 0.3;
  const falling = (delta ?? 0) < -0.3;
  return {
    headline: rising
      ? "BTC dominance rising — capital consolidating; alts (incl. SOL) underperform."
      : falling
      ? "BTC dominance falling — classic altseason setup; SOL beta amplified."
      : "Dominance flat — pair trades over directional alt exposure.",
    bullets: [
      "BTC.D < 50% historically marks peak altseason velocity.",
      "BTC.D > 60% = capital flight to safety within crypto.",
      `Current ${v.toFixed(1)}% — ${v < 50 ? "altseason zone" : v < 58 ? "transitional" : "BTC-led regime"}.`,
      "Cross-reference with ETH/BTC and SOL/BTC ratios for confirmation.",
    ],
  };
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

  const fngDelta = useMemo(() => pctChange(macro?.fearGreed.history), [macro]);
  const dxyDelta = useMemo(() => pctChange(macro?.dollarIndex.history), [macro]);
  const domDelta = useMemo(() => pctChange(macro?.btcDominance.history), [macro]);

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
        <div className="flex-1 overflow-auto overflow-x-hidden p-4 md:p-6">
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
            <div className="mx-auto max-w-6xl space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
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

              {/* === Top KPI cards with sparklines === */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Fear & Greed */}
                <div className="border border-border bg-card p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">US Fear & Greed</span>
                    {(() => { const t = trendOf(fngDelta); const I = t.Icon; return (
                      <span className={`flex items-center gap-1 text-[10px] ${t.cls}`}><I className="h-3 w-3" />{t.label} 30d</span>
                    )})()}
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className={`font-data text-3xl font-bold ${macro ? fngColor(macro.fearGreed.value) : "text-foreground"}`}>
                      {macro ? macro.fearGreed.value : "—"}
                    </span>
                    <span className={`text-xs font-bold uppercase ${macro ? fngColor(macro.fearGreed.value) : "text-muted-foreground"}`}>
                      {macro ? fngRegime(macro.fearGreed.value) : "Loading…"}
                    </span>
                  </div>
                  <MacroChart
                    data={macro?.fearGreed.history ?? []}
                    color="hsl(var(--primary))"
                    domain={[0, 100]}
                    refLines={[{ y: 25 }, { y: 50 }, { y: 75 }]}
                  />
                  {macro && <div className="text-[9px] text-muted-foreground/60">via {macro.fearGreed.source}</div>}
                </div>

                {/* DXY */}
                <div className="border border-border bg-card p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">DXY Index (Proxy)</span>
                    {(() => { const t = trendOf(dxyDelta); const I = t.Icon; return (
                      <span className={`flex items-center gap-1 text-[10px] ${t.cls}`}><I className="h-3 w-3" />{t.label} 30d</span>
                    )})()}
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="font-data text-3xl font-bold text-foreground">
                      {macro ? macro.dollarIndex.value : "—"}
                    </span>
                    <span className="text-xs text-muted-foreground">{macro?.dollarIndex.label || "Loading…"}</span>
                  </div>
                  <MacroChart
                    data={macro?.dollarIndex.history ?? []}
                    color="#f59e0b"
                    refLines={[{ y: 100 }, { y: 105 }]}
                  />
                  {macro && <div className="text-[9px] text-muted-foreground/60">via {macro.dollarIndex.source}</div>}
                </div>

                {/* BTC Dominance */}
                <div className="border border-border bg-card p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">BTC Dominance</span>
                    {(() => { const t = trendOf(domDelta); const I = t.Icon; return (
                      <span className={`flex items-center gap-1 text-[10px] ${t.cls}`}><I className="h-3 w-3" />{t.label} 30d</span>
                    )})()}
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="font-data text-3xl font-bold text-primary">
                      {macro ? `${macro.btcDominance.value}%` : "—"}
                    </span>
                    <span className="text-xs text-muted-foreground">Global market share</span>
                  </div>
                  <MacroChart
                    data={macro?.btcDominance.history ?? []}
                    color="#f7931a"
                    refLines={[{ y: 50 }, { y: 60 }]}
                  />
                  {macro && <div className="text-[9px] text-muted-foreground/60">via {macro.btcDominance.source}</div>}
                </div>
              </div>

              {/* === In-depth intel panels === */}
              {macro && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                  {[
                    { title: "Fear & Greed — Solana Operator Read", intel: fngIntel(macro.fearGreed.value), accent: "border-l-primary" },
                    { title: "Dollar Index — Liquidity Read", intel: dxyIntel(macro.dollarIndex.value, dxyDelta), accent: "border-l-amber-500" },
                    { title: "BTC Dominance — Rotation Read", intel: btcDomIntel(macro.btcDominance.value, domDelta), accent: "border-l-orange-500" },
                  ].map((p, i) => (
                    <div key={i} className={`border border-border border-l-2 ${p.accent} bg-card p-4`}>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">{p.title}</div>
                      <p className="text-xs text-foreground font-medium leading-relaxed mb-3">{p.intel.headline}</p>
                      <ul className="space-y-1.5">
                        {p.intel.bullets.map((b, j) => (
                          <li key={j} className="text-[11px] text-muted-foreground leading-relaxed flex gap-2">
                            <span className="text-primary mt-0.5">▸</span><span>{b}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}

              {/* === Composite regime read === */}
              {macro && (
                <div className="border border-border bg-card p-4">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Composite Regime — SOL Operator Stance</div>
                  <p className="text-xs text-foreground leading-relaxed">
                    {(() => {
                      const fng = macro.fearGreed.value;
                      const dxy = macro.dollarIndex.value;
                      const dom = macro.btcDominance.value;
                      const riskOn = fng >= 55 && dxy < 103 && dom < 56;
                      const riskOff = fng < 35 || dxy > 106 || dom > 60;
                      if (riskOn) return "RISK-ON — Tailwinds align: greedy crowd, soft dollar, falling BTC dominance. Lean long SOL beta and high-conviction Solana DeFi/memecoin baskets. Manage risk with trailing stops.";
                      if (riskOff) return "RISK-OFF — Headwinds dominate: fear, strong dollar, or BTC-led tape. Reduce gross exposure, hold stables on Solana for opportunistic dips, avoid leverage.";
                      return "MIXED — No clean regime. Pair-trade SOL/BTC and SOL/ETH, run smaller sizing, and wait for a confirmed breakout in either direction before scaling exposure.";
                    })()}
                  </p>
                </div>
              )}

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
