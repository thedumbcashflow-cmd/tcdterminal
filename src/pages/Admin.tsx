import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import TerminalCard from "@/components/TerminalCard";
import { format } from "date-fns";
import { Loader2, RefreshCw, Trash2, Plus, Shield, ArrowLeft } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type MarketIntel = Tables<"market_intel">;

const formatValue = (v: number) => {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
};

const Admin = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [checking, setChecking] = useState(true);
  const [records, setRecords] = useState<MarketIntel[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [showAdd, setShowAdd] = useState(false);

  // New record form
  const [newAsset, setNewAsset] = useState("SOL");
  const [newType, setNewType] = useState("buy");
  const [newValue, setNewValue] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newScore, setNewScore] = useState("");
  const [newLiqLevel, setNewLiqLevel] = useState("");
  const [newIntelType, setNewIntelType] = useState("whale_flow");
  const [newPremium, setNewPremium] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate("/auth"); return; }

    const checkAdmin = async () => {
      const { data } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
      setIsAdmin(!!data);
      setChecking(false);
    };
    checkAdmin();
  }, [user, authLoading, navigate]);

  const fetchRecords = async () => {
    setLoadingData(true);
    const { data } = await supabase.from("market_intel").select("*").order("created_at", { ascending: false }).limit(100);
    setRecords(data || []);
    setLastRefresh(new Date());
    setLoadingData(false);
  };

  useEffect(() => { if (isAdmin) fetchRecords(); }, [isAdmin]);

  const deleteRecord = async (id: string) => {
    await supabase.from("market_intel").delete().eq("id", id);
    setRecords((prev) => prev.filter((r) => r.id !== id));
  };

  const addRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.from("market_intel").insert({
      asset_symbol: newAsset,
      flow_type: newIntelType === "whale_flow" ? newType : null,
      intel_type: newIntelType,
      value_usd: parseFloat(newValue) || null,
      wallet_label: newLabel || null,
      whale_flow_score: parseFloat(newScore) || null,
      liquidation_level: parseFloat(newLiqLevel) || null,
      is_premium: newPremium,
    });
    if (!error) {
      setShowAdd(false);
      setNewValue(""); setNewLabel(""); setNewScore(""); setNewLiqLevel("");
      fetchRecords();
    }
    setSubmitting(false);
  };

  if (authLoading || checking) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <Shield className="h-8 w-8 text-destructive mx-auto mb-3" />
          <h2 className="font-serif text-lg font-bold text-foreground">Access Denied</h2>
          <p className="mt-2 text-sm text-muted-foreground">Admin role required.</p>
          <button onClick={() => navigate("/")} className="mt-4 text-xs text-primary hover:underline">← Back to Terminal</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/")} className="text-muted-foreground hover:text-primary">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <h1 className="font-serif text-lg font-bold text-primary">◆ TCD Admin Console</h1>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-data">
            <span>Last refresh: {format(lastRefresh, "HH:mm:ss")}</span>
            <button onClick={fetchRecords} className="border border-border px-2 py-1 hover:text-primary transition-colors">
              <RefreshCw className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* Health Dashboard */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          {[
            { label: "Total Records", value: records.length.toString() },
            { label: "Whale Flows", value: records.filter((r) => r.flow_type).length.toString() },
            { label: "Liquidation Zones", value: records.filter((r) => r.liquidation_level).length.toString() },
            { label: "Premium Records", value: records.filter((r) => r.is_premium).length.toString() },
          ].map((m, i) => (
            <div key={i} className="border border-border bg-card p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{m.label}</div>
              <div className="font-data text-xl font-bold text-primary mt-1">{m.value}</div>
            </div>
          ))}
        </div>

        {/* Add Record */}
        <div className="mb-3">
          <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-1 border border-primary bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary hover:bg-primary/20 transition-colors">
            <Plus className="h-3 w-3" /> Add Record
          </button>
        </div>

        {showAdd && (
          <form onSubmit={addRecord} className="mb-4 border border-border bg-card p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Asset</label>
              <input value={newAsset} onChange={(e) => setNewAsset(e.target.value)} className="mt-1 w-full border border-border bg-background px-2 py-1 text-xs font-data text-foreground" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Intel Type</label>
              <select value={newIntelType} onChange={(e) => setNewIntelType(e.target.value)} className="mt-1 w-full border border-border bg-background px-2 py-1 text-xs font-data text-foreground">
                <option value="whale_flow">Whale Flow</option>
                <option value="liquidation">Liquidation</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Flow Type</label>
              <select value={newType} onChange={(e) => setNewType(e.target.value)} className="mt-1 w-full border border-border bg-background px-2 py-1 text-xs font-data text-foreground">
                <option value="buy">BUY</option>
                <option value="sell">SELL</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Value USD</label>
              <input value={newValue} onChange={(e) => setNewValue(e.target.value)} type="number" className="mt-1 w-full border border-border bg-background px-2 py-1 text-xs font-data text-foreground" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Wallet Label</label>
              <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} className="mt-1 w-full border border-border bg-background px-2 py-1 text-xs font-data text-foreground" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Score</label>
              <input value={newScore} onChange={(e) => setNewScore(e.target.value)} type="number" className="mt-1 w-full border border-border bg-background px-2 py-1 text-xs font-data text-foreground" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Liq Level</label>
              <input value={newLiqLevel} onChange={(e) => setNewLiqLevel(e.target.value)} type="number" className="mt-1 w-full border border-border bg-background px-2 py-1 text-xs font-data text-foreground" />
            </div>
            <div className="flex items-end gap-3">
              <label className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                <input type="checkbox" checked={newPremium} onChange={(e) => setNewPremium(e.target.checked)} className="accent-primary" /> Premium
              </label>
              <button type="submit" disabled={submitting} className="border border-primary bg-primary/10 px-3 py-1 text-xs font-bold text-primary hover:bg-primary/20 disabled:opacity-50">
                {submitting ? "..." : "INSERT"}
              </button>
            </div>
          </form>
        )}

        {/* Records Table */}
        <TerminalCard title="Market Intel Records">
          <div className="grid grid-cols-8 border-b border-border px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            <span>Time</span><span>Asset</span><span>Type</span><span>Intel</span><span>Value</span><span>Label</span><span>Premium</span><span>Actions</span>
          </div>
          {loadingData ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-primary" /></div>
          ) : (
            records.map((row) => (
              <div key={row.id} className="grid grid-cols-8 border-b border-border/30 px-2 py-1 font-data text-xs hover:bg-secondary/30 transition-colors items-center">
                <span className="text-muted-foreground">{format(new Date(row.created_at), "MM/dd HH:mm")}</span>
                <span className="font-bold text-foreground">{row.asset_symbol}</span>
                <span className={row.flow_type === "buy" ? "text-terminal-green" : row.flow_type === "sell" ? "text-terminal-red" : "text-muted-foreground"}>{row.flow_type?.toUpperCase() || "—"}</span>
                <span className="text-muted-foreground">{row.intel_type || "—"}</span>
                <span className="text-foreground">{row.value_usd ? formatValue(row.value_usd) : "—"}</span>
                <span className="text-muted-foreground truncate">{row.wallet_label || "—"}</span>
                <span className={row.is_premium ? "text-primary" : "text-muted-foreground"}>{row.is_premium ? "YES" : "NO"}</span>
                <button onClick={() => deleteRecord(row.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))
          )}
        </TerminalCard>
      </div>
    </div>
  );
};

export default Admin;
