import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMarketIntel } from "@/hooks/useMarketIntel";
import { useSubscriptionTier } from "@/hooks/useSubscriptionTier";
import TerminalCard from "./TerminalCard";
import AssetDetailModal from "./AssetDetailModal";
import { Bot, Loader2 } from "lucide-react";
import { format } from "date-fns";

const formatValue = (v: number) => {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
};

const WhaleFlowTable = () => {
  const { data: dbData, loading } = useMarketIntel();
  const { isPro } = useSubscriptionTier();
  const navigate = useNavigate();
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<any>(null);

  const rows = dbData.length > 0
    ? dbData.map((r) => ({
        id: r.id,
        time: format(new Date(r.created_at), "HH:mm:ss"),
        asset: r.asset_symbol,
        type: r.flow_type?.toUpperCase() || "—",
        value: r.value_usd || 0,
        label: r.wallet_label || "Unknown",
        score: r.whale_flow_score || 0,
        raw: r,
      }))
    : [
        { id: "1", time: "14:32:01", asset: "SOL", type: "BUY", value: 2400000, label: "Smart Money", score: 87, raw: null },
        { id: "2", time: "14:31:45", asset: "JUP", type: "SELL", value: 890000, label: "Whale #412", score: 72, raw: null },
        { id: "3", time: "14:31:22", asset: "SOL", type: "BUY", value: 5100000, label: "Institution", score: 94, raw: null },
        { id: "4", time: "14:30:58", asset: "BONK", type: "SELL", value: 340000, label: "Degen Fund", score: 45, raw: null },
        { id: "5", time: "14:30:41", asset: "RAY", type: "BUY", value: 1200000, label: "Smart Money", score: 68, raw: null },
        { id: "6", time: "14:30:15", asset: "JTO", type: "BUY", value: 670000, label: "Whale #87", score: 56, raw: null },
      ];

  const runAnalysis = async () => {
    setAiLoading(true);
    setAiText("");
    setShowAi(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-market`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({}),
      });
      if (!resp.ok || !resp.body) {
        const err = await resp.json().catch(() => ({ error: "Analysis failed" }));
        setAiText(`Error: ${err.error || "Analysis unavailable"}`);
        setAiLoading(false);
        return;
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nlIdx: number;
        while ((nlIdx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, nlIdx);
          buffer = buffer.slice(nlIdx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") break;
          try {
            const parsed = JSON.parse(json);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              accumulated += content;
              setAiText(accumulated);
            }
          } catch {
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }
    } catch {
      setAiText("Error: Could not connect to AI service.");
    }
    setAiLoading(false);
  };

  return (
    <>
      <TerminalCard
        title="Whale Flow Monitor"
        className="md:col-span-2 lg:col-span-2 lg:row-span-2"
        headerRight={
          <button
            onClick={runAnalysis}
            disabled={aiLoading}
            className="flex items-center gap-1 border border-border px-2 py-0.5 text-[10px] uppercase tracking-wider text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
          >
            {aiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bot className="h-3 w-3" />}
            AI Analysis
          </button>
        }
      >
        <div className="space-y-0">
          {showAi && aiText && (
            <div className="mb-2 border border-primary/30 bg-primary/5 p-2 text-xs text-foreground whitespace-pre-wrap font-data leading-relaxed max-h-40 overflow-auto">
              {aiText}
              {aiLoading && <span className="inline-block w-1.5 h-3 bg-primary animate-pulse ml-0.5" />}
            </div>
          )}

          <div className="grid grid-cols-6 border-b border-border px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            <span>Time</span><span>Asset</span><span>Type</span><span>Value</span><span>Label</span><span>Score</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-xs">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
            </div>
          ) : (
            rows.map((row) => (
              <div
                key={row.id}
                onClick={() => row.raw && setSelectedAsset(row.raw)}
                className={`grid grid-cols-6 border-b border-border/30 px-2 py-1 font-data text-xs transition-colors hover:bg-secondary/30 ${
                  row.raw ? "cursor-pointer" : ""
                } ${row.type === "BUY" ? "bg-terminal-green/[0.03]" : row.type === "SELL" ? "bg-terminal-red/[0.03]" : ""}`}
              >
                <span className="text-muted-foreground">{row.time}</span>
                <span className="font-bold text-foreground">{row.asset}</span>
                <span className={row.type === "BUY" ? "text-terminal-green" : "text-terminal-red"}>{row.type}</span>
                <span className="text-foreground">{typeof row.value === "number" ? formatValue(row.value) : row.value}</span>
                <span className="text-muted-foreground">{row.label}</span>
                <span className="text-primary">{row.score}</span>
              </div>
            ))
          )}
        </div>
      </TerminalCard>

      <AssetDetailModal
        asset={selectedAsset}
        onClose={() => setSelectedAsset(null)}
        isPaid={isPro}
        onUpgrade={() => { setSelectedAsset(null); navigate("/pricing"); }}
      />
    </>
  );
};

export default WhaleFlowTable;
