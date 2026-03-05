import { useState } from "react";
import TopBar from "@/components/TopBar";
import TerminalSidebar from "@/components/TerminalSidebar";
import TerminalCard from "@/components/TerminalCard";
import LiveTicker from "@/components/LiveTicker";
import { ArrowLeft, RefreshCw, Activity } from "lucide-react";
import { useNavigate } from "react-router-dom";

const VALIDATORS_DATA = [
  { name: "Helius", stake: "4.2M SOL", commission: "5%", uptime: "99.98%", version: "1.18.26" },
  { name: "Jito", stake: "8.1M SOL", commission: "7%", uptime: "99.95%", version: "1.18.26" },
  { name: "Marinade", stake: "6.3M SOL", commission: "0%", uptime: "99.99%", version: "1.18.26" },
  { name: "Coinbase Cloud", stake: "3.8M SOL", commission: "8%", uptime: "99.92%", version: "1.18.25" },
  { name: "Everstake", stake: "5.5M SOL", commission: "5%", uptime: "99.97%", version: "1.18.26" },
  { name: "Figment", stake: "2.9M SOL", commission: "6%", uptime: "99.94%", version: "1.18.26" },
  { name: "Chorus One", stake: "3.1M SOL", commission: "5%", uptime: "99.96%", version: "1.18.26" },
  { name: "Laine", stake: "1.8M SOL", commission: "5%", uptime: "99.99%", version: "1.18.26" },
];

const HEALTH_METRICS = [
  { label: "Slot Height", value: "284,392,741", pct: 95, trend: "+2.1%" },
  { label: "Current Epoch", value: "612", pct: 62, trend: "38% remaining" },
  { label: "Active Validators", value: "1,847", pct: 85, trend: "+12 this epoch" },
  { label: "Stake Rate", value: "67.3%", pct: 67, trend: "+0.4%" },
  { label: "Avg Skip Rate", value: "1.2%", pct: 12, trend: "-0.1%" },
  { label: "Non-Vote TPS", value: "3,847", pct: 77, trend: "+5.2%" },
];

const TPS_HISTORY = [
  { time: "00:00", tps: 3200 }, { time: "04:00", tps: 2800 },
  { time: "08:00", tps: 3500 }, { time: "12:00", tps: 4100 },
  { time: "16:00", tps: 3900 }, { time: "20:00", tps: 3600 },
  { time: "Now", tps: 3847 },
];

const NetworkHealth = () => {
  const navigate = useNavigate();
  const [timeRange, setTimeRange] = useState("24h");
  const [sortCol, setSortCol] = useState("stake");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const maxTps = Math.max(...TPS_HISTORY.map((t) => t.tps));

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <TerminalSidebar activeItem="network-health" />
        <main className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-auto p-3">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button onClick={() => navigate("/dashboard")} className="text-muted-foreground hover:text-primary transition-colors">
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <h1 className="font-serif text-sm font-bold text-primary uppercase tracking-wider">
                  Solana Network Health — Deep Dive
                </h1>
              </div>
              <div className="flex items-center gap-2">
                {["1h", "6h", "24h", "7d"].map((r) => (
                  <button
                    key={r}
                    onClick={() => setTimeRange(r)}
                    className={`border px-2 py-1 text-[10px] uppercase tracking-wider transition-colors ${
                      timeRange === r
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:text-primary"
                    }`}
                  >
                    {r}
                  </button>
                ))}
                <button onClick={() => window.location.reload()} className="flex items-center gap-1 border border-border px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors">
                  <RefreshCw className="h-3 w-3" />
                </button>
              </div>
            </div>

            {/* What am I looking at */}
            <div className="mb-3 border border-border/50 bg-secondary/20 p-3">
              <div className="flex items-center gap-2 mb-1">
                <Activity className="h-3.5 w-3.5 text-primary" />
                <span className="text-[10px] uppercase tracking-widest text-primary font-bold">About This Page</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Real-time Solana network health metrics including validator performance, transaction throughput, stake distribution,
                and epoch progress. Use this page to monitor network stability and identify potential congestion events.
              </p>
            </div>

            {/* Health Metrics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-1.5 mb-3">
              {HEALTH_METRICS.map((m, i) => (
                <div key={i} className="border border-border bg-card p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{m.label}</div>
                  <div className="font-data text-lg font-bold text-foreground mt-1">{m.value}</div>
                  <div className="mt-1 h-0.5 w-full bg-secondary">
                    <div className="h-full bg-accent transition-all" style={{ width: `${m.pct}%` }} />
                  </div>
                  <div className="mt-1 text-[10px] font-data text-muted-foreground">{m.trend}</div>
                </div>
              ))}
            </div>

            {/* TPS Timeline */}
            <TerminalCard title="Transaction Throughput (TPS)" className="mb-3">
              <div className="flex items-end gap-1 h-24">
                {TPS_HISTORY.map((t, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full bg-accent/20 relative" style={{ height: `${(t.tps / maxTps) * 80}px` }}>
                      <div
                        className="absolute bottom-0 w-full bg-accent transition-all"
                        style={{ height: `${(t.tps / maxTps) * 100}%` }}
                      />
                    </div>
                    <span className="text-[8px] text-muted-foreground font-data">{t.time}</span>
                  </div>
                ))}
              </div>
            </TerminalCard>

            {/* Validators Table */}
            <TerminalCard title="Top Validators">
              <div className="overflow-x-auto">
                <div className="grid grid-cols-5 border-b border-border px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground min-w-[500px]">
                  <span>Validator</span>
                  <span>Total Stake</span>
                  <span>Commission</span>
                  <span>Uptime</span>
                  <span>Version</span>
                </div>
                {VALIDATORS_DATA.map((v, i) => (
                  <div key={i} className="grid grid-cols-5 border-b border-border/30 px-2 py-1.5 font-data text-xs hover:bg-secondary/30 transition-colors min-w-[500px]">
                    <span className="font-bold text-foreground">{v.name}</span>
                    <span className="text-foreground">{v.stake}</span>
                    <span className="text-muted-foreground">{v.commission}</span>
                    <span className="text-terminal-green">{v.uptime}</span>
                    <span className="text-muted-foreground">{v.version}</span>
                  </div>
                ))}
              </div>
            </TerminalCard>
          </div>
          <LiveTicker />
        </main>
      </div>
    </div>
  );
};

export default NetworkHealth;
