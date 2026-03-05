import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import TopBar from "@/components/TopBar";
import TerminalSidebar from "@/components/TerminalSidebar";
import TerminalCard from "@/components/TerminalCard";
import LiveTicker from "@/components/LiveTicker";
import { useMarketIntel } from "@/hooks/useMarketIntel";
import { format } from "date-fns";
import { ArrowLeft, RefreshCw, Download, Bot, Loader2 } from "lucide-react";

const formatValue = (v: number) => {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
};

const WhaleFlows = () => {
  const navigate = useNavigate();
  const { data, loading } = useMarketIntel();
  const [filterAsset, setFilterAsset] = useState("ALL");
  const [filterType, setFilterType] = useState("ALL");
  const [sortBy, setSortBy] = useState<"time" | "value" | "score">("time");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const whaleData = data.filter((r) => r.intel_type === "whale_flow" || r.flow_type);

  const assets = useMemo(() => {
    const set = new Set(whaleData.map((r) => r.asset_symbol));
    return ["ALL", ...Array.from(set).sort()];
  }, [whaleData]);

  const filtered = useMemo(() => {
    let rows = whaleData;
    if (filterAsset !== "ALL") rows = rows.filter((r) => r.asset_symbol === filterAsset);
    if (filterType !== "ALL") rows = rows.filter((r) => r.flow_type?.toUpperCase() === filterType);

    rows.sort((a, b) => {
      const dir = sortDir === "desc" ? -1 : 1;
      if (sortBy === "time") return dir * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      if (sortBy === "value") return dir * ((a.value_usd || 0) - (b.value_usd || 0));
      return dir * ((a.whale_flow_score || 0) - (b.whale_flow_score || 0));
    });
    return rows;
  }, [whaleData, filterAsset, filterType, sortBy, sortDir]);

  const toggleSort = (col: "time" | "value" | "score") => {
    if (sortBy === col) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortBy(col); setSortDir("desc"); }
  };

  const runAnalysis = async () => {
    setAiLoading(true);
    setAiText("");
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-market`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        body: JSON.stringify({ asset_symbol: filterAsset === "ALL" ? undefined : filterAsset }),
      });
      if (!resp.ok || !resp.body) { setAiText("Analysis unavailable."); setAiLoading(false); return; }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "", accumulated = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nlIdx;
        while ((nlIdx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, nlIdx); buffer = buffer.slice(nlIdx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") break;
          try { const p = JSON.parse(json); const c = p.choices?.[0]?.delta?.content; if (c) { accumulated += c; setAiText(accumulated); } } catch { break; }
        }
      }
    } catch { setAiText("Error connecting to AI."); }
    setAiLoading(false);
  };

  const sortIcon = (col: string) => sortBy === col ? (sortDir === "desc" ? " ▼" : " ▲") : "";

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <TerminalSidebar activeItem="whale-flows" />
        <main className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-auto p-3">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button onClick={() => navigate("/dashboard")} className="text-muted-foreground hover:text-primary transition-colors">
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <h1 className="font-serif text-sm font-bold text-primary uppercase tracking-wider">Whale Flow Monitor — Deep Dive</h1>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={runAnalysis} disabled={aiLoading} className="flex items-center gap-1 border border-border px-2 py-1 text-[10px] uppercase tracking-wider text-primary hover:bg-primary/10 transition-colors disabled:opacity-50">
                  {aiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bot className="h-3 w-3" />} AI Analysis
                </button>
                <button className="flex items-center gap-1 border border-border px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors">
                  <Download className="h-3 w-3" /> Export
                </button>
                <button onClick={() => window.location.reload()} className="flex items-center gap-1 border border-border px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors">
                  <RefreshCw className="h-3 w-3" /> Refresh
                </button>
              </div>
            </div>

            {/* Filters */}
            <div className="mb-3 flex items-center gap-2">
              <select value={filterAsset} onChange={(e) => setFilterAsset(e.target.value)} className="border border-border bg-card px-2 py-1 text-xs text-foreground font-data">
                {assets.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="border border-border bg-card px-2 py-1 text-xs text-foreground font-data">
                <option value="ALL">ALL TYPES</option>
                <option value="BUY">BUY</option>
                <option value="SELL">SELL</option>
              </select>
              <span className="ml-auto text-[10px] text-muted-foreground font-data">{filtered.length} records</span>
            </div>

            {/* AI Panel */}
            {aiText && (
              <div className="mb-3 border border-primary/30 bg-primary/5 p-3 text-xs text-foreground whitespace-pre-wrap font-data leading-relaxed max-h-48 overflow-auto">
                {aiText}
                {aiLoading && <span className="inline-block w-1.5 h-3 bg-primary animate-pulse ml-0.5" />}
              </div>
            )}

            {/* Table */}
            <TerminalCard title="Flow Data">
              <div className="grid grid-cols-6 border-b border-border px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                <button onClick={() => toggleSort("time")} className="text-left hover:text-primary">Time{sortIcon("time")}</button>
                <span>Asset</span>
                <span>Type</span>
                <button onClick={() => toggleSort("value")} className="text-left hover:text-primary">Value{sortIcon("value")}</button>
                <span>Label</span>
                <button onClick={() => toggleSort("score")} className="text-left hover:text-primary">Score{sortIcon("score")}</button>
              </div>
              {loading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground text-xs"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…</div>
              ) : filtered.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">No whale flow data matching filters.</div>
              ) : (
                filtered.map((row, i) => (
                  <div key={row.id || i} className={`grid grid-cols-6 border-b border-border/30 px-2 py-1 font-data text-xs hover:bg-secondary/30 transition-colors ${row.flow_type?.toUpperCase() === "BUY" ? "bg-terminal-green/[0.03]" : row.flow_type?.toUpperCase() === "SELL" ? "bg-terminal-red/[0.03]" : ""}`}>
                    <span className="text-muted-foreground">{format(new Date(row.created_at), "HH:mm:ss")}</span>
                    <span className="font-bold text-foreground">{row.asset_symbol}</span>
                    <span className={row.flow_type?.toUpperCase() === "BUY" ? "text-terminal-green" : "text-terminal-red"}>{row.flow_type?.toUpperCase() || "—"}</span>
                    <span className="text-foreground">{formatValue(row.value_usd || 0)}</span>
                    <span className="text-muted-foreground">{row.wallet_label || "Unknown"}</span>
                    <span className="text-primary">{row.whale_flow_score || "—"}</span>
                  </div>
                ))
              )}
            </TerminalCard>
          </div>
          <LiveTicker />
        </main>
      </div>
    </div>
  );
};

export default WhaleFlows;
