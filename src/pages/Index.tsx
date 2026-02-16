import TopBar from "@/components/TopBar";
import TerminalSidebar from "@/components/TerminalSidebar";
import TerminalCard from "@/components/TerminalCard";
import LiveTicker from "@/components/LiveTicker";
import { TrendingUp, TrendingDown, Activity, DollarSign } from "lucide-react";

const MetricCard = ({
  label,
  value,
  change,
  icon,
}: {
  label: string;
  value: string;
  change?: number;
  icon: React.ReactNode;
}) => (
  <div className="border border-border bg-card p-3">
    <div className="flex items-center justify-between">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      {icon}
    </div>
    <div className="mt-1 font-data text-xl font-bold text-foreground">{value}</div>
    {change !== undefined && (
      <div
        className={`mt-0.5 font-data text-xs ${
          change >= 0 ? "text-terminal-green" : "text-terminal-red"
        }`}
      >
        {change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(2)}% 24h
      </div>
    )}
  </div>
);

const whaleRows = [
  { time: "14:32:01", asset: "SOL", type: "BUY", value: "$2.4M", label: "Smart Money" },
  { time: "14:31:45", asset: "JUP", type: "SELL", value: "$890K", label: "Whale #412" },
  { time: "14:31:22", asset: "SOL", type: "BUY", value: "$5.1M", label: "Institution" },
  { time: "14:30:58", asset: "BONK", type: "SELL", value: "$340K", label: "Degen Fund" },
  { time: "14:30:41", asset: "RAY", type: "BUY", value: "$1.2M", label: "Smart Money" },
  { time: "14:30:15", asset: "JTO", type: "BUY", value: "$670K", label: "Whale #87" },
  { time: "14:29:59", asset: "SOL", type: "SELL", value: "$3.8M", label: "Profit Taking" },
  { time: "14:29:33", asset: "PYTH", type: "BUY", value: "$450K", label: "Smart Money" },
  { time: "14:29:10", asset: "SOL", type: "BUY", value: "$1.9M", label: "Whale #203" },
  { time: "14:28:47", asset: "WIF", type: "SELL", value: "$720K", label: "Degen Fund" },
  { time: "14:28:22", asset: "RNDR", type: "BUY", value: "$3.2M", label: "Institution" },
  { time: "14:27:58", asset: "SOL", type: "BUY", value: "$6.7M", label: "Smart Money" },
];

const Index = () => {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <TerminalSidebar />
        <main className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-auto p-3">
            {/* Metric Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 mb-3">
              <MetricCard
                label="SOL Price"
                value="$178.42"
                change={3.21}
                icon={<TrendingUp className="h-3.5 w-3.5 text-terminal-green" />}
              />
              <MetricCard
                label="REV (24h)"
                value="$2.4M"
                change={12.5}
                icon={<DollarSign className="h-3.5 w-3.5 text-primary" />}
              />
              <MetricCard
                label="Non-Vote TPS"
                value="3,847"
                change={-1.2}
                icon={<Activity className="h-3.5 w-3.5 text-accent" />}
              />
              <MetricCard
                label="USDC Velocity"
                value="$847M"
                change={5.67}
                icon={<TrendingUp className="h-3.5 w-3.5 text-terminal-green" />}
              />
            </div>

            {/* Bento Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1.5">
              <TerminalCard title="Whale Flow Monitor" className="md:col-span-2 lg:col-span-2 lg:row-span-2">
                <div className="space-y-0">
                  {/* Table Header */}
                  <div className="grid grid-cols-5 border-b border-border px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <span>Time</span>
                    <span>Asset</span>
                    <span>Type</span>
                    <span>Value</span>
                    <span>Label</span>
                  </div>
                  {whaleRows.map((row, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-5 border-b border-border/30 px-2 py-1 font-data text-xs hover:bg-secondary/30 transition-colors"
                    >
                      <span className="text-muted-foreground">{row.time}</span>
                      <span className="font-bold text-foreground">{row.asset}</span>
                      <span className={row.type === "BUY" ? "text-terminal-green" : "text-terminal-red"}>
                        {row.type}
                      </span>
                      <span className="text-foreground">{row.value}</span>
                      <span className="text-muted-foreground">{row.label}</span>
                    </div>
                  ))}
                </div>
              </TerminalCard>

              <TerminalCard title="Network Health">
                <div className="space-y-3">
                  {[
                    { label: "Slot Height", value: "284,392,741", pct: 95 },
                    { label: "Epoch", value: "612", pct: 62 },
                    { label: "Active Validators", value: "1,847", pct: 85 },
                    { label: "Stake Rate", value: "67.3%", pct: 67 },
                  ].map((item, i) => (
                    <div key={i}>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          {item.label}
                        </span>
                        <span className="font-data text-sm font-bold text-foreground">{item.value}</span>
                      </div>
                      <div className="mt-1 h-0.5 w-full bg-secondary">
                        <div
                          className="h-full bg-accent transition-all"
                          style={{ width: `${item.pct}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </TerminalCard>

              <TerminalCard title="Top Liquidation Zones">
                <div className="space-y-2">
                  {[
                    { price: "$175.00", volume: "$12.4M", intensity: 90 },
                    { price: "$172.50", volume: "$8.7M", intensity: 65 },
                    { price: "$180.00", volume: "$6.2M", intensity: 45 },
                    { price: "$168.00", volume: "$4.1M", intensity: 30 },
                  ].map((zone, i) => (
                    <div key={i} className="space-y-0.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-data text-foreground">{zone.price}</span>
                        <span className="font-data text-muted-foreground">{zone.volume}</span>
                      </div>
                      <div className="h-1 w-full bg-secondary">
                        <div
                          className="h-full transition-all"
                          style={{
                            width: `${zone.intensity}%`,
                            background: `linear-gradient(90deg, hsl(var(--accent)), hsl(var(--primary)))`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </TerminalCard>

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
                  {[
                    { label: "Data Feed", status: "OPERATIONAL", ok: true },
                    { label: "RPC Node", status: "OPERATIONAL", ok: true },
                    { label: "Sheet Sync", status: "LAST: 2m AGO", ok: true },
                    { label: "Helius API", status: "CONNECTED", ok: true },
                  ].map((s, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{s.label}</span>
                      <div className="flex items-center gap-1.5">
                        <span className={`h-1.5 w-1.5 rounded-full ${s.ok ? "bg-terminal-green" : "bg-terminal-red"}`} />
                        <span className="font-data text-[10px] text-muted-foreground">{s.status}</span>
                      </div>
                    </div>
                  ))}
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
