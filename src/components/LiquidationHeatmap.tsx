import TerminalCard from "./TerminalCard";
import { useSubscriptionTier } from "@/hooks/useSubscriptionTier";
import { useMarketIntel } from "@/hooks/useMarketIntel";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Lock } from "lucide-react";

const MOCK_ZONES = [
  { price: "$168", volume: 4100000 },
  { price: "$170", volume: 6800000 },
  { price: "$172", volume: 8700000 },
  { price: "$175", volume: 12400000 },
  { price: "$178", volume: 5200000 },
  { price: "$180", volume: 6200000 },
  { price: "$182", volume: 3100000 },
  { price: "$185", volume: 7500000 },
];

const formatVol = (v: number) => `$${(v / 1_000_000).toFixed(1)}M`;

const getBarColor = (volume: number, max: number) => {
  const ratio = volume / max;
  // Interpolate from accent (blue) to primary (amber)
  if (ratio > 0.7) return "hsl(34, 100%, 52%)";
  if (ratio > 0.4) return "hsl(30, 80%, 48%)";
  return "hsl(216, 100%, 50%)";
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="border border-border bg-card p-2 text-xs font-data">
      <p className="text-muted-foreground">{label}</p>
      <p className="text-primary font-bold">{formatVol(payload[0].value)}</p>
    </div>
  );
};

const LiquidationHeatmap = () => {
  const { isPro, loading: tierLoading } = useSubscriptionTier();
  const { data: dbData } = useMarketIntel();

  const liqData = dbData.filter((r) => r.liquidation_level != null);
  const useMock = liqData.length === 0;

  const chartData = useMock
    ? MOCK_ZONES
    : liqData.map((r) => ({
        price: `$${Number(r.liquidation_level).toFixed(0)}`,
        volume: r.value_usd || 0,
      }));

  const maxVol = Math.max(...chartData.map((d) => d.volume), 1);

  return (
    <TerminalCard title="Liquidation Heatmap">
      <div className="relative">
        {!tierLoading && !isPro && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
            <Lock className="h-5 w-5 text-primary mb-2" />
            <span className="text-[10px] uppercase tracking-widest text-primary font-bold">
              Terminal Access Restricted
            </span>
            <span className="text-[10px] text-muted-foreground mt-1">Upgrade to PRO</span>
          </div>
        )}
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={chartData}>
            <XAxis
              dataKey="price"
              tick={{ fontSize: 10, fill: "hsl(220, 10%, 55%)" }}
              axisLine={{ stroke: "hsl(220, 15%, 18%)" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "hsl(220, 10%, 55%)" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={formatVol}
              width={50}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(220, 20%, 12%)" }} />
            <Bar dataKey="volume" radius={[0, 0, 0, 0]}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={getBarColor(entry.volume, maxVol)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </TerminalCard>
  );
};

export default LiquidationHeatmap;
