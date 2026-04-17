import { useNavigate } from "react-router-dom";
import { useState, useRef } from "react";
import TopBar from "@/components/TopBar";
import TerminalSidebar from "@/components/TerminalSidebar";
import { useSubscriptionTier } from "@/hooks/useSubscriptionTier";
import { useDataRoom } from "@/hooks/useDataRoom";
import { formatTvl } from "@/services/defiLlama";
import { Lock, RefreshCw } from "lucide-react";

// ── Skeleton rows ──
function SkeletonRows() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map(i => (
        <div key={i} className="bg-zinc-800 animate-pulse rounded h-4 w-full" />
      ))}
    </div>
  );
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  // Translate common errors into actionable copy
  let label = message;
  if (/429/.test(message)) label = "Rate limited (HTTP 429). Try again in a moment.";
  else if (/404/.test(message)) label = "Endpoint not found (HTTP 404).";
  else if (/Failed to fetch|NetworkError/i.test(message)) label = "Network error reaching upstream provider.";
  else if (/502/.test(message)) label = "Upstream gateway error (HTTP 502).";
  return (
    <div className="font-mono text-xs text-red-400 flex items-center gap-2">
      <span>Failed to load — {label}</span>
      <button
        onClick={onRetry}
        className="border border-red-500/40 text-red-300 px-2 py-0.5 rounded hover:bg-red-500/10 transition-colors"
      >
        Retry ↺
      </button>
    </div>
  );
}

// ── Format helpers ──
function fmtChange(v: number | null) {
  if (v == null) return <span className="text-zinc-500">—</span>;
  const color = v >= 0 ? "text-green-400" : "text-red-400";
  return <span className={color}>{v >= 0 ? "+" : ""}{v.toFixed(1)}%</span>;
}

function fmtDate(unix: number) {
  return new Date(unix * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── TVL Chart (pure SVG) ──
const TvlChart = ({ data }: { data: Array<{ date: number; tvl: number }> }) => {
  const [hover, setHover] = useState<{ x: number; idx: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  if (data.length === 0) return null;

  const W = 600, H = 160, PX = 30, PY = 15;
  const minTvl = Math.min(...data.map(d => d.tvl));
  const maxTvl = Math.max(...data.map(d => d.tvl));
  const range = maxTvl - minTvl || 1;

  const points = data.map((d, i) => {
    const x = PX + (i / (data.length - 1)) * (W - PX * 2);
    const y = PY + (1 - (d.tvl - minTvl) / range) * (H - PY * 2);
    return { x, y, ...d };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath = linePath + ` L${points[points.length - 1].x},${H - PY} L${points[0].x},${H - PY} Z`;

  // Y-axis labels
  const yLabels = [minTvl, (minTvl + maxTvl) / 2, maxTvl].map(v => ({
    label: formatTvl(v),
    y: PY + (1 - (v - minTvl) / range) * (H - PY * 2),
  }));

  // X-axis labels (4 evenly spaced)
  const xLabels = [0, Math.floor(data.length / 3), Math.floor((data.length * 2) / 3), data.length - 1].map(i => ({
    label: fmtDate(data[i].date),
    x: points[i].x,
  }));

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * W;
    let closest = 0;
    let minDist = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(p.x - mouseX);
      if (d < minDist) { minDist = d; closest = i; }
    });
    setHover({ x: points[closest].x, idx: closest });
  };

  const hoverData = hover ? data[hover.idx] : null;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-[160px]"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHover(null)}
      >
        <path d={areaPath} className="fill-green-400 opacity-5" />
        <path d={linePath} className="stroke-green-400 fill-none" strokeWidth="1.5" />
        {yLabels.map((l, i) => (
          <text key={i} x={2} y={l.y + 3} className="fill-zinc-500 font-mono" fontSize="9">{l.label}</text>
        ))}
        {xLabels.map((l, i) => (
          <text key={i} x={l.x} y={H - 2} textAnchor="middle" className="fill-zinc-500 font-mono" fontSize="9">{l.label}</text>
        ))}
        {hover && (
          <line x1={hover.x} y1={PY} x2={hover.x} y2={H - PY} className="stroke-zinc-600" strokeDasharray="2,2" />
        )}
      </svg>
      {hover && hoverData && (
        <div
          className="absolute bg-zinc-800 border border-zinc-700 font-mono text-[10px] text-zinc-300 px-2 py-1.5 rounded pointer-events-none z-10"
          style={{ left: `${(hover.x / W) * 100}%`, top: 0, transform: "translateX(-50%)" }}
        >
          <div>{fmtDate(hoverData.date)}</div>
          <div>TVL: {formatTvl(hoverData.tvl)}</div>
        </div>
      )}
    </div>
  );
};

const DataRoom = () => {
  const navigate = useNavigate();
  const { isPro, loading: subLoading } = useSubscriptionTier();
  const { tvlHistory, topProtocols, dexVolumes, topPools, revenueData, loading, errors, lastUpdated, refresh, retryPanel } = useDataRoom();

  // Locked state for non-pro users
  if (subLoading) {
    return (
      <div className="flex h-screen flex-col overflow-hidden">
        <TopBar />
        <div className="flex flex-1 overflow-hidden">
          <TerminalSidebar activeItem="data-room" />
          <main className="flex flex-1 flex-col overflow-auto p-3">
            <SkeletonRows />
          </main>
        </div>
      </div>
    );
  }

  if (!isPro) {
    return (
      <div className="flex h-screen flex-col overflow-hidden">
        <TopBar />
        <div className="flex flex-1 overflow-hidden">
          <TerminalSidebar activeItem="data-room" />
          <main className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <Lock className="h-6 w-6 text-zinc-600 mx-auto mb-3" />
              <h2 className="font-mono text-sm text-zinc-400">Data Room requires a Pro subscription</h2>
              <button
                onClick={() => navigate("/pricing")}
                className="mt-4 border border-zinc-700 text-zinc-300 font-mono text-xs px-4 py-2 rounded-md hover:border-zinc-500 transition-colors"
              >
                View Plans
              </button>
            </div>
          </main>
        </div>
      </div>
    );
  }

  // Compute TVL stats
  const currentTvl = tvlHistory.length > 0 ? tvlHistory[tvlHistory.length - 1].tvl : 0;
  const tvl7dAgo = tvlHistory.length >= 8 ? tvlHistory[tvlHistory.length - 8].tvl : currentTvl;
  const tvl7dChange = tvl7dAgo > 0 ? ((currentTvl - tvl7dAgo) / tvl7dAgo) * 100 : 0;

  const maxDexVol = dexVolumes ? Math.max(...dexVolumes.protocols.map(p => p.dailyVolume), 1) : 1;

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <TerminalSidebar activeItem="data-room" />
        <main className="flex flex-1 flex-col overflow-auto p-3 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-mono text-xs text-zinc-400 tracking-widest">DATA ROOM</h1>
              <p className="font-mono text-[10px] text-zinc-500 mt-0.5">
                Solana on-chain analytics — powered by DeFiLlama &amp; GeckoTerminal
              </p>
            </div>
            <div className="flex items-center gap-3">
              {lastUpdated && (
                <span className="font-mono text-[10px] text-zinc-500">
                  Updated: {lastUpdated.toLocaleTimeString("en-US", { hour12: false })} UTC
                </span>
              )}
              <button
                onClick={refresh}
                className="font-mono text-xs text-zinc-400 border border-zinc-700 hover:border-zinc-500 px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-colors"
              >
                <RefreshCw className="h-3 w-3" /> Refresh All
              </button>
            </div>
          </div>

          {/* ═══ PANEL 1: ON-CHAIN ANALYTICS ═══ */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* TVL Chart */}
              <div>
                <h3 className="font-mono text-[10px] text-zinc-400 tracking-widest mb-4">SOLANA TVL — 90 DAYS</h3>
                {loading.tvl ? <SkeletonRows /> : errors.tvl ? <ErrorPanel message={errors.tvl} onRetry={refresh} /> : (
                  <>
                    <TvlChart data={tvlHistory} />
                    <div className="flex gap-6 mt-3">
                      <div>
                        <span className="text-zinc-500 font-mono text-[10px]">CURRENT TVL</span>
                        <div className="font-mono text-sm text-zinc-50">{formatTvl(currentTvl)}</div>
                      </div>
                      <div>
                        <span className="text-zinc-500 font-mono text-[10px]">7D CHANGE</span>
                        <div className="font-mono text-sm">{fmtChange(tvl7dChange)}</div>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Top Protocols */}
              <div>
                <h3 className="font-mono text-[10px] text-zinc-400 tracking-widest mb-4">TOP SOLANA PROTOCOLS — TVL</h3>
                {loading.protocols ? <SkeletonRows /> : errors.protocols ? <ErrorPanel message={errors.protocols} onRetry={refresh} /> : (
                  <table className="w-full">
                    <thead>
                      <tr className="font-mono text-[9px] text-zinc-500 uppercase tracking-wider">
                        <th className="pb-2 text-left w-6">#</th>
                        <th className="pb-2 text-left">Protocol</th>
                        <th className="pb-2 text-left">Category</th>
                        <th className="pb-2 text-right">TVL</th>
                        <th className="pb-2 text-right">24h</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topProtocols.map((p, i) => (
                        <tr key={p.name} className="border-b border-zinc-800/50 font-mono text-xs">
                          <td className="py-1.5 text-zinc-500">{i + 1}</td>
                          <td className="py-1.5 text-zinc-300 flex items-center gap-2">
                            {p.logo ? (
                              <img src={p.logo} alt="" className="w-4 h-4 rounded-full" />
                            ) : (
                              <div className="w-4 h-4 rounded-full bg-zinc-700" />
                            )}
                            {p.name}
                          </td>
                          <td className="py-1.5 text-zinc-500 text-[10px]">{p.category}</td>
                          <td className="py-1.5 text-zinc-50 text-right">{formatTvl(p.tvl)}</td>
                          <td className="py-1.5 text-right">{fmtChange(p.change_1d)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          {/* ═══ PANEL 2: DEX VOLUMES ═══ */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Bar chart */}
              <div>
                <h3 className="font-mono text-[10px] text-zinc-400 tracking-widest mb-1">DEX VOLUME — 24H BY PROTOCOL</h3>
                {loading.dex ? <SkeletonRows /> : errors.dex ? <ErrorPanel message={errors.dex} onRetry={refresh} /> : dexVolumes && (
                  <>
                    <div className="mb-4 flex items-baseline gap-2">
                      <span className="font-mono text-xl text-zinc-50 font-semibold">{formatTvl(dexVolumes.totalDailyVolume)}</span>
                      <span className="font-mono text-[10px] text-zinc-500">total 24h DEX volume on Solana</span>
                    </div>
                    <div className="space-y-2">
                      {dexVolumes.protocols.map(p => (
                        <div key={p.name} className="flex items-center gap-3">
                          {p.logo ? (
                            <img src={p.logo} alt="" className="w-4 h-4 rounded-full" />
                          ) : (
                            <div className="w-4 h-4 rounded-full bg-zinc-700 flex-shrink-0" />
                          )}
                          <span className="font-mono text-[10px] text-zinc-400 w-20 truncate">{p.name}</span>
                          <div className="flex-1 bg-zinc-800 rounded-full h-1.5 relative">
                            <div
                              className="bg-green-400 rounded-full h-full"
                              style={{ width: `${(p.dailyVolume / maxDexVol) * 100}%` }}
                            />
                          </div>
                          <span className="font-mono text-[10px] text-zinc-300 w-16 text-right">{formatTvl(p.dailyVolume)}</span>
                          <span className="font-mono text-[9px] w-12 text-right">{fmtChange(p.change_1d)}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Top Pools */}
              <div>
                <h3 className="font-mono text-[10px] text-zinc-400 tracking-widest mb-4">TOP SOLANA POOLS — 24H VOLUME</h3>
                {loading.pools ? <SkeletonRows /> : errors.pools ? <ErrorPanel message={errors.pools} onRetry={refresh} /> : (
                  <table className="w-full">
                    <thead>
                      <tr className="font-mono text-[9px] text-zinc-500 uppercase tracking-wider">
                        <th className="pb-2 text-left">Pool</th>
                        <th className="pb-2 text-left">DEX</th>
                        <th className="pb-2 text-right">24h Vol</th>
                        <th className="pb-2 text-right">Liquidity</th>
                        <th className="pb-2 text-right">Price Δ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topPools.map(p => (
                        <tr key={p.address} className="border-b border-zinc-800/50 font-mono text-xs">
                          <td className="py-1.5 text-zinc-300 max-w-[140px] overflow-hidden text-ellipsis whitespace-nowrap">{p.name}</td>
                          <td className="py-1.5 text-zinc-500 text-[10px] capitalize">{p.dex.replace(/-/g, " ")}</td>
                          <td className="py-1.5 text-zinc-50 text-right">{formatTvl(parseFloat(p.volume_h24))}</td>
                          <td className="py-1.5 text-zinc-400 text-right">{formatTvl(parseFloat(p.reserve_in_usd))}</td>
                          <td className="py-1.5 text-right">{fmtChange(parseFloat(p.price_change_h24))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          {/* ═══ PANEL 3: PROTOCOL REVENUE ═══ */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Revenue Table */}
              <div>
                <h3 className="font-mono text-[10px] text-zinc-400 tracking-widest mb-1">PROTOCOL REVENUE — SOLANA</h3>
                {loading.revenue ? <SkeletonRows /> : errors.revenue ? <ErrorPanel message={errors.revenue} onRetry={refresh} /> : revenueData && (
                  <>
                    <div className="mb-4 flex items-baseline gap-2">
                      <span className="font-mono text-xl text-zinc-50 font-semibold">{formatTvl(revenueData.totalDailyRevenue)}</span>
                      <span className="font-mono text-[10px] text-zinc-500">total protocol revenue today</span>
                    </div>
                    <table className="w-full">
                      <thead>
                        <tr className="font-mono text-[9px] text-zinc-500 uppercase tracking-wider">
                          <th className="pb-2 text-left w-6">#</th>
                          <th className="pb-2 text-left">Protocol</th>
                          <th className="pb-2 text-left">Cat</th>
                          <th className="pb-2 text-right">Daily Rev</th>
                          <th className="pb-2 text-right">Fees</th>
                          <th className="pb-2 text-right">Δ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {revenueData.protocols.map((p, i) => (
                          <tr key={p.name} className="border-b border-zinc-800/50 font-mono text-xs">
                            <td className="py-1.5 text-zinc-500">{i + 1}</td>
                            <td className="py-1.5 text-zinc-300 flex items-center gap-2">
                              {p.logo ? (
                                <img src={p.logo} alt="" className="w-4 h-4 rounded-full" />
                              ) : (
                                <div className="w-4 h-4 rounded-full bg-zinc-700" />
                              )}
                              {p.name}
                            </td>
                            <td className="py-1.5 text-zinc-500 text-[10px]">{p.category}</td>
                            <td className="py-1.5 text-zinc-50 text-right">{formatTvl(p.dailyRevenue)}</td>
                            <td className="py-1.5 text-zinc-400 text-right">{formatTvl(p.dailyFees)}</td>
                            <td className="py-1.5 text-right">{fmtChange(p.change_1d)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </div>

              {/* Revenue/Fees Ratio Bars */}
              <div>
                <h3 className="font-mono text-[10px] text-zinc-400 tracking-widest mb-4">REVENUE / FEES RATIO — TOP 8</h3>
                {loading.revenue ? <SkeletonRows /> : errors.revenue ? <ErrorPanel message={errors.revenue} onRetry={refresh} /> : revenueData && (
                  <>
                    <div className="space-y-3">
                      {revenueData.protocols.slice(0, 8).map(p => {
                        const ratio = p.dailyFees > 0 ? Math.min(100, Math.round((p.dailyRevenue / p.dailyFees) * 100)) : 0;
                        return (
                          <div key={p.name} className="flex items-center gap-3">
                            {p.logo ? (
                              <img src={p.logo} alt="" className="w-4 h-4 rounded-full" />
                            ) : (
                              <div className="w-4 h-4 rounded-full bg-zinc-700 flex-shrink-0" />
                            )}
                            <span className="font-mono text-[10px] text-zinc-400 w-20 truncate">{p.name}</span>
                            <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden flex">
                              {p.dailyFees > 0 ? (
                                <>
                                  <div className="bg-green-400 h-full" style={{ width: `${ratio}%` }} />
                                  <div className="bg-zinc-600 h-full" style={{ width: `${100 - ratio}%` }} />
                                </>
                              ) : (
                                <div className="bg-zinc-700 h-full w-full" />
                              )}
                            </div>
                            <span className="font-mono text-[9px] text-zinc-400 w-10 text-right">
                              {p.dailyFees > 0 ? `${ratio}%` : "—"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <p className="font-mono text-[9px] text-zinc-600 mt-4">
                      Revenue = fees retained by protocol treasury. Fees = total paid by users.<br />
                      Source: DeFiLlama open API — api.llama.fi
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Attribution Footer */}
          <div className="bg-zinc-900/50 border-t border-zinc-800/50 py-3 px-6 mt-8 font-mono text-[9px] text-zinc-600">
            TVL &amp; Revenue data: DeFiLlama (api.llama.fi) — open source, no API key required
            {" · "}Pool data: GeckoTerminal (api.geckoterminal.com) — free public API
            {" · "}Network data: Solana RPC (mainnet-beta)
            {" · "}Refreshes every 5 minutes
            {lastUpdated && ` · Last updated: ${lastUpdated.toLocaleTimeString("en-US", { hour12: false })} UTC`}
          </div>
        </main>
      </div>
    </div>
  );
};

export default DataRoom;
