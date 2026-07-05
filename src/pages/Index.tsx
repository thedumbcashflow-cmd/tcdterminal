import { useEffect, useState } from "react";
import TopBar from "@/components/TopBar";
import TerminalSidebar from "@/components/TerminalSidebar";
import TerminalCard from "@/components/TerminalCard";
import LiveTicker from "@/components/LiveTicker";
import WhaleFlowTable from "@/components/WhaleFlowTable";
import LiquidationHeatmap from "@/components/LiquidationHeatmap";
import { Loader2, TrendingUp, TrendingDown, Activity, DollarSign } from "lucide-react";
import { useSolanaStats } from "@/hooks/useSolanaStats";
import { supabase } from "@/integrations/supabase/client";
import { maybeHealSheetSync } from "@/lib/sheetSyncHealer";

interface HealthProbe {
  ok: boolean; status: string; latencyMs?: number | null;
  lastRunAt?: string | null; ageSec?: number | null; detail?: string;
  errorMessage?: string | null; lastSuccessAt?: string | null; lastErrorAt?: string | null;
}
interface HealthResponse { helius: HealthProbe; sheetSync: HealthProbe; checkedAt: string; }

const fmtRelative = (iso?: string | null): string => {
  if (!iso) return "never";
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
};

const fmtUsd = (n: number | null, compact = false): string => {
  if (n == null || isNaN(n)) return "—";
  if (compact) {
    if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
    return `$${n.toFixed(2)}`;
  }
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const fmtNum = (n: number | null, decimals = 0): string => {
  if (n == null || isNaN(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: decimals });
};
const fmtPct = (n: number | null): string => {
  if (n == null || isNaN(n)) return "—";
  return `${n.toFixed(1)}%`;
};

const Spin = () => <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />;

const MetricCard = ({
  label,
  value,
  change,
  icon,
  loading,
}: {
  label: string;
  value: string;
  change?: number | null;
  icon: React.ReactNode;
  loading?: boolean;
}) => (
  <div className="border border-border bg-card p-3">
    <div className="flex items-center justify-between">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      {icon}
    </div>
    <div className="mt-1 font-data text-xl font-bold text-foreground">
      {loading ? <Spin /> : value}
    </div>
    {change !== undefined && change !== null && !loading && (
      <div
        className={`mt-0.5 font-data text-xs ${
          change >= 0 ? "text-terminal-green" : "text-terminal-red"
        }`}
      >
        {change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(2)}% 24h
      </div>
    )}
    {(change === null || change === undefined) && !loading && (
      <div className="mt-0.5 font-data text-xs text-muted-foreground">—</div>
    )}
  </div>
);

const Index = () => {
  const stats = useSolanaStats(30_000);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let syncTriggered = false;
    const probe = async () => {
      setHealthLoading(true);
      const { data, error } = await supabase.functions.invoke("health-check");
      if (cancelled) return;
      if (!error && data) {
        const h = data as HealthResponse;
        setHealth(h);
        if (maybeHealSheetSync(h, (n) => supabase.functions.invoke(n).catch(() => {}), syncTriggered)) {
          syncTriggered = true;
        }
      }
      setHealthLoading(false);
    };
    probe();
    const id = setInterval(probe, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const networkRows = [
    {
      label: "Slot Height",
      value: stats.epochInfo ? fmtNum(stats.epochInfo.absoluteSlot) : "—",
      pct: stats.epochInfo ? Math.min(100, (stats.epochInfo.absoluteSlot % 1_000_000) / 10_000) : 0,
    },
    {
      label: "Epoch",
      value: stats.epochInfo ? `${stats.epochInfo.epoch} · ${stats.epochInfo.pct.toFixed(1)}%` : "—",
      pct: stats.epochInfo?.pct ?? 0,
    },
    {
      label: "Active Validators",
      value: stats.activeValidators != null ? fmtNum(stats.activeValidators) : "—",
      pct:
        stats.totalValidators && stats.activeValidators
          ? (stats.activeValidators / stats.totalValidators) * 100
          : 0,
    },
    {
      label: "Stake Rate",
      value: stats.stakeRatePct != null ? fmtPct(stats.stakeRatePct) : "—",
      pct: stats.stakeRatePct ?? 0,
    },
  ];

  const sysStatus = [
    {
      label: "Solscan API",
      status: stats.error ? "ERROR" : stats.loading ? "POLLING…" : "CONNECTED",
      ok: !stats.error,
      lastSuccessAt: null as string | null,
      lastErrorAt: null as string | null,
      errorMessage: stats.error || null,
    },
    {
      label: "RPC Node",
      status: stats.epochInfo ? "OPERATIONAL" : stats.loading ? "CONNECTING…" : "OFFLINE",
      ok: !!stats.epochInfo,
      lastSuccessAt: null,
      lastErrorAt: null,
      errorMessage: stats.epochInfo ? null : "No epoch info returned",
    },
    {
      label: "Sheet Sync",
      status: healthLoading ? "PROBING…" : (health?.sheetSync?.status ?? "UNKNOWN"),
      ok: !!health?.sheetSync?.ok,
      lastSuccessAt: health?.sheetSync?.lastSuccessAt ?? null,
      lastErrorAt: health?.sheetSync?.lastErrorAt ?? null,
      errorMessage: health?.sheetSync?.errorMessage ?? null,
    },
    {
      label: "Helius API",
      status: healthLoading ? "PROBING…" : (health?.helius?.status ?? "UNKNOWN"),
      ok: !!health?.helius?.ok,
      lastSuccessAt: health?.helius?.lastSuccessAt ?? null,
      lastErrorAt: health?.helius?.lastErrorAt ?? null,
      errorMessage: health?.helius?.errorMessage ?? null,
    },
  ];

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <TerminalSidebar />
        <main className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-auto p-3">
            {stats.error && (
              <div className="mb-3 flex items-center justify-between border border-terminal-red/40 bg-terminal-red/10 px-3 py-2 text-xs text-terminal-red">
                <span>Data fetch error: {stats.error}</span>
                <button
                  onClick={stats.refresh}
                  className="border border-terminal-red/40 px-2 py-0.5 font-data text-[10px] uppercase tracking-wider hover:bg-terminal-red/20"
                >
                  Retry
                </button>
              </div>
            )}

            {/* KPI Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 mb-3">
              <MetricCard
                label="SOL Price"
                value={fmtUsd(stats.solPrice)}
                change={stats.solChange24h}
                loading={stats.loading && stats.solPrice == null}
                icon={
                  (stats.solChange24h ?? 0) >= 0 ? (
                    <TrendingUp className="h-3.5 w-3.5 text-terminal-green" />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5 text-terminal-red" />
                  )
                }
              />
              <MetricCard
                label="Validators"
                value={
                  stats.activeValidators != null && stats.totalValidators != null
                    ? `${fmtNum(stats.activeValidators)} / ${fmtNum(stats.totalValidators)}`
                    : "—"
                }
                loading={stats.loading && stats.activeValidators == null}
                icon={<DollarSign className="h-3.5 w-3.5 text-primary" />}
              />
              <MetricCard
                label="Non-Vote TPS"
                value={fmtNum(stats.tpsNonVote)}
                loading={stats.loading && stats.tpsNonVote == null}
                icon={<Activity className="h-3.5 w-3.5 text-accent" />}
              />
              <MetricCard
                label="USDC Vol 24h"
                value={fmtUsd(stats.usdcVol24h, true)}
                change={stats.usdcChange24h}
                loading={stats.loading && stats.usdcVol24h == null}
                icon={
                  (stats.usdcChange24h ?? 0) >= 0 ? (
                    <TrendingUp className="h-3.5 w-3.5 text-terminal-green" />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5 text-terminal-red" />
                  )
                }
              />
            </div>

            {/* Bento Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1.5">
              <WhaleFlowTable />

              <TerminalCard title="Network Health">
                <div className="space-y-3">
                  {networkRows.map((item, i) => (
                    <div key={i}>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          {item.label}
                        </span>
                        <span className="font-data text-sm font-bold text-foreground">
                          {stats.loading && item.value === "—" ? <Spin /> : item.value}
                        </span>
                      </div>
                      <div className="mt-1 h-0.5 w-full bg-secondary">
                        <div
                          className="h-full bg-accent transition-all"
                          style={{ width: `${item.pct}%` }}
                        />
                      </div>
                    </div>
                  ))}
                  {stats.lastUpdated && (
                    <div className="pt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                      Updated {stats.lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </div>
                  )}
                </div>
              </TerminalCard>

              <LiquidationHeatmap />

              <TerminalCard title="DePIN Tracker" className="md:col-span-2">
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { name: "Helium (HNT)", tvl: "$1.2B", change: 4.2 },
                    { name: "Hivemapper (HONEY)", tvl: "$89M", change: -1.8 },
                    { name: "Render (RNDR)", tvl: "$4.1B", change: 7.3 },
                  ].map((project, i) => (
                    <div key={i} className="border border-border/50 p-2">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {project.name}
                      </div>
                      <div className="mt-1 font-data text-sm font-bold text-foreground">{project.tvl}</div>
                      <div
                        className={`font-data text-xs ${
                          project.change >= 0 ? "text-terminal-green" : "text-terminal-red"
                        }`}
                      >
                        {project.change >= 0 ? "▲" : "▼"} {Math.abs(project.change)}%
                      </div>
                    </div>
                  ))}
                </div>
              </TerminalCard>

              <TerminalCard title="System Status">
                <div className="space-y-2">
                  {sysStatus.map((s, i) => {
                    const tooltip = [
                      s.lastSuccessAt ? `Last OK: ${fmtRelative(s.lastSuccessAt)}` : null,
                      s.lastErrorAt ? `Last error: ${fmtRelative(s.lastErrorAt)}` : null,
                      s.errorMessage ? `Reason: ${s.errorMessage}` : null,
                    ].filter(Boolean).join("\n");
                    return (
                      <div key={i} className="flex flex-col gap-0.5 text-xs" title={tooltip || undefined}>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">{s.label}</span>
                          <div className="flex items-center gap-1.5">
                            <span className={`h-1.5 w-1.5 rounded-full ${s.ok ? "bg-terminal-green" : "bg-terminal-red"}`} />
                            <span className="font-data text-[10px] text-muted-foreground">{s.status}</span>
                          </div>
                        </div>
                        {(s.lastSuccessAt || s.errorMessage) && (
                          <div className="font-data text-[9px] text-muted-foreground/70 leading-tight">
                            {s.lastSuccessAt && <span>ok {fmtRelative(s.lastSuccessAt)}</span>}
                            {s.lastSuccessAt && s.errorMessage && <span> · </span>}
                            {s.errorMessage && !s.ok && (
                              <span className="text-terminal-red/80">{s.errorMessage.slice(0, 48)}</span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </TerminalCard>
            </div>
          </div>
          <LiveTicker />
        </main>
      </div>
    </div>
  );
};

export default Index;
