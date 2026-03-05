import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import TopBar from "@/components/TopBar";
import TerminalSidebar from "@/components/TerminalSidebar";
import TerminalCard from "@/components/TerminalCard";
import LiveTicker from "@/components/LiveTicker";
import { useMarketIntel } from "@/hooks/useMarketIntel";
import { useSubscriptionTier } from "@/hooks/useSubscriptionTier";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { ArrowLeft, Lock, RefreshCw } from "lucide-react";

const formatVol = (v: number) => `$${(v / 1_000_000).toFixed(1)}M`;

const getBarColor = (volume: number, max: number) => {
  const ratio = volume / max;
  if (ratio > 0.7) return "hsl(34, 100%, 52%)";
  if (ratio > 0.4) return "hsl(30, 80%, 48%)";
  return "hsl(216, 100%, 50%)";
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="border border-border bg-card p-2 text-xs font-data">
      <p className="text-muted-foreground">Price Level: {label}</p>
      <p className="text-primary font-bold">Volume: {formatVol(payload[0].value)}</p>
    </div>
  );
};

const Liquidations = () => {
  const navigate = useNavigate();
  const { isPro, loading: tierLoading } = useSubscriptionTier();
  const { data } = useMarketIntel();

  const liqData = useMemo(() => {
    return data
      .filter((r) => r.liquidation_level != null)
      .map((r) => ({ price: `$${Number(r.liquidation_level).toFixed(0)}`, volume: r.value_usd || 0 }))
      .sort((a, b) => parseInt(a.price.slice(1)) - parseInt(b.price.slice(1)));
  }, [data]);

  const maxVol = Math.max(...liqData.map((d) => d.volume), 1);

  if (!tierLoading && !isPro) {
    return (
      <div className="flex h-screen flex-col overflow-hidden">
        <TopBar />
        <div className="flex flex-1 overflow-hidden">
          <TerminalSidebar activeItem="liquidations" />
          <main className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <Lock className="h-8 w-8 text-primary mx-auto mb-3" />
              <h2 className="font-serif text-lg font-bold text-primary">Terminal Access Restricted</h2>
              <p className="mt-2 text-sm text-muted-foreground">Liquidation deep-dive requires a PRO or WHALE plan.</p>
              <button
                onClick={() => navigate("/pricing?return=/liquidations")}
                className="mt-4 border border-primary bg-primary/10 px-6 py-2 text-xs font-bold uppercase tracking-wider text-primary hover:bg-primary/20 transition-colors"
              >
                View Plans
              </button>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <TerminalSidebar activeItem="liquidations" />
        <main className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-auto p-3">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button onClick={() => navigate("/dashboard")} className="text-muted-foreground hover:text-primary transition-colors">
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <h1 className="font-serif text-sm font-bold text-primary uppercase tracking-wider">Liquidation Heatmap — Deep Dive</h1>
              </div>
              <button onClick={() => window.location.reload()} className="flex items-center gap-1 border border-border px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors">
                <RefreshCw className="h-3 w-3" /> Refresh
              </button>
            </div>

            <TerminalCard title="Liquidation Volume by Price Level">
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={liqData}>
                  <XAxis dataKey="price" tick={{ fontSize: 10, fill: "hsl(220, 10%, 55%)" }} axisLine={{ stroke: "hsl(220, 15%, 18%)" }} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(220, 10%, 55%)" }} axisLine={false} tickLine={false} tickFormatter={formatVol} width={60} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(220, 20%, 12%)" }} />
                  <Bar dataKey="volume" radius={[0, 0, 0, 0]}>
                    {liqData.map((entry, i) => <Cell key={i} fill={getBarColor(entry.volume, maxVol)} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </TerminalCard>

            <div className="mt-3">
              <TerminalCard title="Liquidation Table">
                <div className="grid grid-cols-3 border-b border-border px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <span>Price Level</span>
                  <span>Volume</span>
                  <span>Intensity</span>
                </div>
                {liqData.map((row, i) => (
                  <div key={i} className="grid grid-cols-3 border-b border-border/30 px-2 py-1 font-data text-xs hover:bg-secondary/30 transition-colors">
                    <span className="text-foreground font-bold">{row.price}</span>
                    <span className="text-foreground">{formatVol(row.volume)}</span>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 bg-secondary">
                        <div className="h-full transition-all" style={{ width: `${(row.volume / maxVol) * 100}%`, background: getBarColor(row.volume, maxVol) }} />
                      </div>
                    </div>
                  </div>
                ))}
              </TerminalCard>
            </div>
          </div>
          <LiveTicker />
        </main>
      </div>
    </div>
  );
};

export default Liquidations;
