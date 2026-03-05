import { useState, useMemo } from "react";
import TopBar from "@/components/TopBar";
import TerminalSidebar from "@/components/TerminalSidebar";
import TerminalCard from "@/components/TerminalCard";
import LiveTicker from "@/components/LiveTicker";
import { ArrowLeft, RefreshCw, Cpu, TrendingUp, TrendingDown } from "lucide-react";
import { useNavigate } from "react-router-dom";

const DEPIN_PROJECTS = [
  { name: "Helium", symbol: "HNT", tvl: 1200000000, marketCap: 1800000000, change24h: 4.2, category: "Wireless", devices: 980000, revenue30d: 2400000, status: "Live" },
  { name: "Render", symbol: "RNDR", tvl: 4100000000, marketCap: 5200000000, change24h: 7.3, category: "Compute", devices: 12000, revenue30d: 8900000, status: "Live" },
  { name: "Hivemapper", symbol: "HONEY", tvl: 89000000, marketCap: 120000000, change24h: -1.8, category: "Mapping", devices: 145000, revenue30d: 340000, status: "Live" },
  { name: "IoTeX", symbol: "IOTX", tvl: 450000000, marketCap: 780000000, change24h: 2.1, category: "IoT", devices: 220000, revenue30d: 1200000, status: "Live" },
  { name: "Akash", symbol: "AKT", tvl: 680000000, marketCap: 920000000, change24h: 5.6, category: "Compute", devices: 8500, revenue30d: 3100000, status: "Live" },
  { name: "Filecoin", symbol: "FIL", tvl: 3200000000, marketCap: 4500000000, change24h: -0.9, category: "Storage", devices: 3800, revenue30d: 12000000, status: "Live" },
  { name: "Theta", symbol: "THETA", tvl: 890000000, marketCap: 1400000000, change24h: 1.4, category: "Video", devices: 150000, revenue30d: 1800000, status: "Live" },
  { name: "DIMO", symbol: "DIMO", tvl: 120000000, marketCap: 180000000, change24h: 8.9, category: "Mobility", devices: 85000, revenue30d: 450000, status: "Beta" },
  { name: "Grass", symbol: "GRASS", tvl: 340000000, marketCap: 520000000, change24h: 15.2, category: "Data", devices: 2200000, revenue30d: 780000, status: "Live" },
  { name: "Nosana", symbol: "NOS", tvl: 95000000, marketCap: 140000000, change24h: 3.3, category: "Compute", devices: 2400, revenue30d: 210000, status: "Live" },
];

const CATEGORIES = ["ALL", "Wireless", "Compute", "Mapping", "IoT", "Storage", "Video", "Mobility", "Data"];

const formatBig = (v: number) => {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v}`;
};

const formatNum = (v: number) => v.toLocaleString();

const DePINTracker = () => {
  const navigate = useNavigate();
  const [filterCat, setFilterCat] = useState("ALL");
  const [sortBy, setSortBy] = useState<"tvl" | "change" | "devices" | "revenue">("tvl");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const filtered = useMemo(() => {
    let rows = DEPIN_PROJECTS;
    if (filterCat !== "ALL") rows = rows.filter((r) => r.category === filterCat);
    rows = [...rows].sort((a, b) => {
      const dir = sortDir === "desc" ? -1 : 1;
      if (sortBy === "tvl") return dir * (a.tvl - b.tvl);
      if (sortBy === "change") return dir * (a.change24h - b.change24h);
      if (sortBy === "devices") return dir * (a.devices - b.devices);
      return dir * (a.revenue30d - b.revenue30d);
    });
    return rows;
  }, [filterCat, sortBy, sortDir]);

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortBy(col); setSortDir("desc"); }
  };

  const sortIcon = (col: string) => sortBy === col ? (sortDir === "desc" ? " ▼" : " ▲") : "";

  const totalTVL = DEPIN_PROJECTS.reduce((s, p) => s + p.tvl, 0);
  const totalDevices = DEPIN_PROJECTS.reduce((s, p) => s + p.devices, 0);
  const totalRevenue = DEPIN_PROJECTS.reduce((s, p) => s + p.revenue30d, 0);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <TerminalSidebar activeItem="depin-tracker" />
        <main className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-auto p-3">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button onClick={() => navigate("/dashboard")} className="text-muted-foreground hover:text-primary transition-colors">
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <h1 className="font-serif text-sm font-bold text-primary uppercase tracking-wider">
                  DePIN Tracker — Deep Dive
                </h1>
              </div>
              <button onClick={() => window.location.reload()} className="flex items-center gap-1 border border-border px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors">
                <RefreshCw className="h-3 w-3" /> Refresh
              </button>
            </div>

            {/* About */}
            <div className="mb-3 border border-border/50 bg-secondary/20 p-3">
              <div className="flex items-center gap-2 mb-1">
                <Cpu className="h-3.5 w-3.5 text-primary" />
                <span className="text-[10px] uppercase tracking-widest text-primary font-bold">About This Page</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Track Decentralized Physical Infrastructure Networks (DePIN) across categories. Monitor total value locked,
                device counts, protocol revenue, and market performance for the DePIN sector.
              </p>
            </div>

            {/* Summary Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 mb-3">
              <div className="border border-border bg-card p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total DePIN TVL</div>
                <div className="font-data text-xl font-bold text-primary mt-1">{formatBig(totalTVL)}</div>
              </div>
              <div className="border border-border bg-card p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Connected Devices</div>
                <div className="font-data text-xl font-bold text-foreground mt-1">{formatNum(totalDevices)}</div>
              </div>
              <div className="border border-border bg-card p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">30d Revenue</div>
                <div className="font-data text-xl font-bold text-foreground mt-1">{formatBig(totalRevenue)}</div>
              </div>
              <div className="border border-border bg-card p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Projects Tracked</div>
                <div className="font-data text-xl font-bold text-foreground mt-1">{DEPIN_PROJECTS.length}</div>
              </div>
            </div>

            {/* Filters */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setFilterCat(c)}
                  className={`border px-2 py-1 text-[10px] uppercase tracking-wider transition-colors ${
                    filterCat === c
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-primary"
                  }`}
                >
                  {c}
                </button>
              ))}
              <span className="ml-auto text-[10px] text-muted-foreground font-data">{filtered.length} projects</span>
            </div>

            {/* Table */}
            <TerminalCard title="DePIN Projects">
              <div className="overflow-x-auto">
                <div className="grid grid-cols-8 border-b border-border px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground min-w-[700px]">
                  <span>Project</span>
                  <span>Symbol</span>
                  <span>Category</span>
                  <button onClick={() => toggleSort("tvl")} className="text-left hover:text-primary">TVL{sortIcon("tvl")}</button>
                  <button onClick={() => toggleSort("change")} className="text-left hover:text-primary">24h{sortIcon("change")}</button>
                  <button onClick={() => toggleSort("devices")} className="text-left hover:text-primary">Devices{sortIcon("devices")}</button>
                  <button onClick={() => toggleSort("revenue")} className="text-left hover:text-primary">30d Rev{sortIcon("revenue")}</button>
                  <span>Status</span>
                </div>
                {filtered.length === 0 ? (
                  <div className="py-8 text-center text-xs text-muted-foreground">No projects matching filter.</div>
                ) : (
                  filtered.map((p, i) => (
                    <div key={i} className="grid grid-cols-8 border-b border-border/30 px-2 py-1.5 font-data text-xs hover:bg-secondary/30 transition-colors min-w-[700px]">
                      <span className="font-bold text-foreground">{p.name}</span>
                      <span className="text-muted-foreground">{p.symbol}</span>
                      <span className="text-muted-foreground">{p.category}</span>
                      <span className="text-foreground">{formatBig(p.tvl)}</span>
                      <span className={`flex items-center gap-1 ${p.change24h >= 0 ? "text-terminal-green" : "text-terminal-red"}`}>
                        {p.change24h >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {Math.abs(p.change24h)}%
                      </span>
                      <span className="text-foreground">{formatNum(p.devices)}</span>
                      <span className="text-foreground">{formatBig(p.revenue30d)}</span>
                      <span className={p.status === "Live" ? "text-terminal-green" : "text-primary"}>{p.status}</span>
                    </div>
                  ))
                )}
              </div>
            </TerminalCard>
          </div>
          <LiveTicker />
        </main>
      </div>
    </div>
  );
};

export default DePINTracker;
