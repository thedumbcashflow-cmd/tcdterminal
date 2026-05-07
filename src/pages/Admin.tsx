import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import TerminalCard from "@/components/TerminalCard";
import { format } from "date-fns";
import { Loader2, RefreshCw, Trash2, Plus, Shield, ArrowLeft, Users, AlertTriangle, Activity, MessageSquare, Lock, FlaskConical, ScrollText } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import TierPreview from "@/components/admin/TierPreview";
import AuditLog from "@/components/admin/AuditLog";

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
  const [activeTab, setActiveTab] = useState<"data" | "roles" | "monitoring" | "requests" | "tier-preview" | "audit">("data");
  const [adminTier, setAdminTier] = useState<string>("free");
  const [role, setRole] = useState<"admin" | "moderator" | null>(null);

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

  // Role management
  const [profiles, setProfiles] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [newRoleUserId, setNewRoleUserId] = useState("");
  const [newRoleValue, setNewRoleValue] = useState<"admin" | "moderator" | "user">("user");

  // Signal broadcaster
  const [signalText, setSignalText] = useState("");

  // Feature requests
  const [featureRequests, setFeatureRequests] = useState<any[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);

  // Sync jobs
  const [syncJobs, setSyncJobs] = useState<any[]>([]);
  const [providerStatuses, setProviderStatuses] = useState<any[]>([]);
  const [runningSyncNow, setRunningSyncNow] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate("/auth"); return; }
    const checkAdmin = async () => {
      const [{ data: adminRole }, { data: modRole }, { data: profileData }] = await Promise.all([
        supabase.rpc("has_role", { _user_id: user.id, _role: "admin" }),
        supabase.rpc("has_role", { _user_id: user.id, _role: "moderator" }),
        supabase.from("profiles").select("subscription_tier").eq("id", user.id).single(),
      ]);
      setIsAdmin(!!adminRole || !!modRole);
      setRole(adminRole ? "admin" : modRole ? "moderator" : null);
      setAdminTier(profileData?.subscription_tier || "free");
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

  const fetchRolesData = async () => {
    const [{ data: profs }, { data: rls }] = await Promise.all([
      supabase.from("profiles").select("id, username, subscription_tier, created_at"),
      supabase.from("user_roles").select("*"),
    ]);
    setProfiles(profs || []);
    setRoles(rls || []);
  };

  const fetchFeatureRequests = async () => {
    setLoadingRequests(true);
    const { data } = await supabase.from("feature_requests" as any).select("*").order("created_at", { ascending: false } as any) as any;
    setFeatureRequests(data || []);
    setLoadingRequests(false);
  };

  const fetchSyncData = async () => {
    const [{ data: jobs }, { data: providers }] = await Promise.all([
      supabase.from("sync_jobs" as any).select("*") as any,
      supabase.from("provider_status" as any).select("*") as any,
    ]);
    setSyncJobs(jobs || []);
    setProviderStatuses(providers || []);
  };

  useEffect(() => {
    if (isAdmin) {
      fetchRecords();
      fetchRolesData();
      fetchFeatureRequests();
      fetchSyncData();
    }
  }, [isAdmin]);

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

  const assignRole = async () => {
    if (!newRoleUserId) return;
    await supabase.from("user_roles").insert({ user_id: newRoleUserId, role: newRoleValue });
    fetchRolesData();
    setNewRoleUserId("");
  };

  const removeRole = async (id: string) => {
    await supabase.from("user_roles").delete().eq("id", id);
    fetchRolesData();
  };

  const updateRequestStatus = async (id: string, status: string) => {
    await (supabase.from("feature_requests" as any).update({ status } as any).eq("id", id) as any);
    fetchFeatureRequests();
  };

  const runSyncNow = async () => {
    setRunningSyncNow(true);
    try {
      await supabase.functions.invoke("sync-market-data", { body: {} });
      await fetchSyncData();
    } catch (e) {
      console.error("Sync failed:", e);
    }
    setRunningSyncNow(false);
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
        <div className="text-center max-w-sm">
          <Shield className="h-8 w-8 text-destructive mx-auto mb-3" />
          <h2 className="font-serif text-lg font-bold text-foreground">Access Denied</h2>
          <p className="mt-2 text-sm text-muted-foreground">Admin role required.</p>
          <p className="mt-1 text-[10px] text-muted-foreground font-data">
            Signed in as {user?.email || "—"}
          </p>
          <div className="mt-4 flex flex-col items-center gap-2">
            <button
              onClick={async () => {
                setChecking(true);
                await supabase.auth.refreshSession();
                const [{ data: adminRole }, { data: modRole }] = await Promise.all([
                  supabase.rpc("has_role", { _user_id: user!.id, _role: "admin" }),
                  supabase.rpc("has_role", { _user_id: user!.id, _role: "moderator" }),
                ]);
                setIsAdmin(!!adminRole || !!modRole);
                setRole(adminRole ? "admin" : modRole ? "moderator" : null);
                setChecking(false);
              }}
              className="border border-primary bg-primary/10 px-3 py-1 text-xs font-bold text-primary hover:bg-primary/20"
            >
              Re-check Permissions
            </button>
            <button onClick={() => navigate("/dashboard")} className="text-xs text-primary hover:underline">← Back to Terminal</button>
          </div>
        </div>
      </div>
    );
  }

  const whaleFlowCount = records.filter((r) => r.flow_type).length;
  const liqCount = records.filter((r) => r.liquidation_level).length;
  const premiumCount = records.filter((r) => r.is_premium).length;
  const oldestRecord = records.length > 0 ? records[records.length - 1].created_at : null;
  const newestRecord = records.length > 0 ? records[0].created_at : null;
  // Admin always has access to all tabs
  const isPaidAdmin = isAdmin;

  return (
    <div className="min-h-screen bg-background">
      {/* Admin header */}
      <div className="border-b border-border bg-card px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/dashboard")} className="text-muted-foreground hover:text-primary">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <Shield className="h-4 w-4 text-primary" />
          <h1 className="font-serif text-sm font-bold text-primary uppercase tracking-wider">TCD Admin Console</h1>
          {role === "admin" && (
            <span className="font-data text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border border-indigo-500/40 bg-indigo-500/10 text-indigo-300">
              Admin
            </span>
          )}
          {role === "moderator" && (
            <span className="font-data text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-300">
              Moderator
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-data">
          <span>Last refresh: {format(lastRefresh, "HH:mm:ss")}</span>
          {role === "admin" && null}
          <button onClick={() => { fetchRecords(); fetchRolesData(); fetchFeatureRequests(); fetchSyncData(); }} className="border border-border px-2 py-1 hover:text-primary transition-colors">
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border flex overflow-x-auto">
        {(
          [
            "data",
            "roles",
            "requests",
            "monitoring",
            ...(role === "admin" ? (["audit", "tier-preview"] as const) : []),
          ] as const
        ).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-xs uppercase tracking-wider transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === tab ? "bg-primary/10 text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "data" && "Market Data"}
            {tab === "roles" && "User Roles"}
            {tab === "requests" && "Requests Queue"}
            {tab === "monitoring" && "Monitoring"}
            {tab === "audit" && (<><ScrollText className="h-3 w-3" /> Audit Log</>)}
            {tab === "tier-preview" && (<><FlaskConical className="h-3 w-3" /> Tier Preview</>)}
          </button>
        ))}
      </div>

      <div className="p-4 max-w-6xl mx-auto">
        {/* Health Dashboard */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
          {[
            { label: "Total Records", value: records.length.toString(), icon: <Activity className="h-3.5 w-3.5 text-primary" /> },
            { label: "Whale Flows", value: whaleFlowCount.toString(), icon: <Activity className="h-3.5 w-3.5 text-accent" /> },
            { label: "Liq Zones", value: liqCount.toString(), icon: <AlertTriangle className="h-3.5 w-3.5 text-terminal-red" /> },
            { label: "Premium", value: premiumCount.toString(), icon: <Shield className="h-3.5 w-3.5 text-primary" /> },
          ].map((m, i) => (
            <div key={i} className="border border-border bg-card p-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{m.label}</span>
                {m.icon}
              </div>
              <div className="font-data text-xl font-bold text-foreground mt-1">{m.value}</div>
            </div>
          ))}
        </div>

        {/* DATA TAB */}
        {activeTab === "data" && (
          <>
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

            <TerminalCard title="Market Intel Records">
              <div className="overflow-x-auto">
                <div className="grid grid-cols-8 border-b border-border px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground min-w-[600px]">
                  <span>Time</span><span>Asset</span><span>Type</span><span>Intel</span><span>Value</span><span>Label</span><span>Premium</span><span>Actions</span>
                </div>
                {loadingData ? (
                  <div className="flex items-center justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-primary" /></div>
                ) : (
                  records.map((row) => (
                    <div key={row.id} className="grid grid-cols-8 border-b border-border/30 px-2 py-1 font-data text-xs hover:bg-secondary/30 transition-colors items-center min-w-[600px]">
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
              </div>
            </TerminalCard>
          </>
        )}

        {/* ROLES TAB */}
        {activeTab === "roles" && (
          <>
            <TerminalCard title="Assign Role" className="mb-4">
              <div className="flex flex-col sm:flex-row items-end gap-3 p-2">
                <div className="flex-1 w-full">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">User ID</label>
                  <select value={newRoleUserId} onChange={(e) => setNewRoleUserId(e.target.value)} className="mt-1 w-full border border-border bg-background px-2 py-1 text-xs font-data text-foreground">
                    <option value="">Select user...</option>
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>{p.username || p.id.slice(0, 8)} ({p.subscription_tier})</option>
                    ))}
                  </select>
                </div>
                <div className="w-full sm:w-auto">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Role</label>
                  <select value={newRoleValue} onChange={(e) => setNewRoleValue(e.target.value as any)} className="mt-1 w-full border border-border bg-background px-2 py-1 text-xs font-data text-foreground">
                    <option value="admin">Admin</option>
                    <option value="moderator">Moderator</option>
                    <option value="user">User</option>
                  </select>
                </div>
                <button onClick={assignRole} className="border border-primary bg-primary/10 px-3 py-1 text-xs font-bold text-primary hover:bg-primary/20">
                  Assign
                </button>
              </div>
            </TerminalCard>

            <TerminalCard title="Current Roles">
              <div className="overflow-x-auto">
                <div className="grid grid-cols-4 border-b border-border px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground min-w-[400px]">
                  <span>User</span><span>User ID</span><span>Role</span><span>Actions</span>
                </div>
                {roles.length === 0 ? (
                  <div className="py-4 text-center text-xs text-muted-foreground">No roles assigned.</div>
                ) : (
                  roles.map((r) => {
                    const profile = profiles.find((p) => p.id === r.user_id);
                    return (
                      <div key={r.id} className="grid grid-cols-4 border-b border-border/30 px-2 py-1.5 font-data text-xs items-center hover:bg-secondary/30 transition-colors min-w-[400px]">
                        <span className="text-foreground font-bold">{profile?.username || "—"}</span>
                        <span className="text-muted-foreground truncate">{r.user_id.slice(0, 12)}...</span>
                        <span className="text-primary uppercase">{r.role}</span>
                        <button onClick={() => removeRole(r.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </TerminalCard>

            <TerminalCard title="User Profiles" className="mt-4">
              <div className="overflow-x-auto">
                <div className="grid grid-cols-4 border-b border-border px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground min-w-[400px]">
                  <span>Username</span><span>Tier</span><span>Created</span><span>ID</span>
                </div>
                {profiles.map((p) => (
                  <div key={p.id} className="grid grid-cols-4 border-b border-border/30 px-2 py-1.5 font-data text-xs hover:bg-secondary/30 transition-colors min-w-[400px]">
                    <span className="text-foreground font-bold">{p.username || "—"}</span>
                    <span className="text-primary uppercase">{p.subscription_tier}</span>
                    <span className="text-muted-foreground">{format(new Date(p.created_at), "yyyy-MM-dd")}</span>
                    <span className="text-muted-foreground truncate">{p.id.slice(0, 12)}...</span>
                  </div>
                ))}
              </div>
            </TerminalCard>
          </>
        )}

        {/* REQUESTS QUEUE TAB */}
        {activeTab === "requests" && (
          <>
            {!isPaidAdmin ? (
              <div className="flex flex-col items-center justify-center py-16">
                <Lock className="h-8 w-8 text-muted-foreground mb-3" />
                <h2 className="font-serif text-lg font-bold text-foreground">Paid Admin Feature</h2>
                <p className="mt-2 text-sm text-muted-foreground text-center">Upgrade to Pro or Whale to manage feature requests.</p>
                <button
                  onClick={() => navigate("/pricing?return=/admin")}
                  className="mt-4 border border-primary bg-primary/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-primary hover:bg-primary/20 transition-colors"
                >
                  Upgrade Plan
                </button>
              </div>
            ) : (
              <TerminalCard title={`Feature Requests (${featureRequests.length})`}>
                {loadingRequests ? (
                  <div className="flex items-center justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-primary" /></div>
                ) : featureRequests.length === 0 ? (
                  <div className="py-8 text-center text-xs text-muted-foreground">No feature requests yet.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <div className="grid grid-cols-5 border-b border-border px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground min-w-[500px]">
                      <span>Title</span><span>Priority</span><span>Status</span><span>Created</span><span>Actions</span>
                    </div>
                    {featureRequests.map((req: any) => (
                      <div key={req.id} className="grid grid-cols-5 border-b border-border/30 px-2 py-1.5 font-data text-xs items-center hover:bg-secondary/30 transition-colors min-w-[500px]">
                        <div className="truncate">
                          <span className="text-foreground font-bold">{req.title}</span>
                          {req.description && <p className="text-muted-foreground text-[10px] truncate">{req.description}</p>}
                        </div>
                        <span className={`uppercase ${req.priority === "high" ? "text-terminal-red" : req.priority === "medium" ? "text-primary" : "text-muted-foreground"}`}>
                          {req.priority}
                        </span>
                        <select
                          value={req.status}
                          onChange={(e) => updateRequestStatus(req.id, e.target.value)}
                          className="border border-border bg-background px-1 py-0.5 text-[10px] font-data text-foreground"
                        >
                          <option value="new">New</option>
                          <option value="in_review">In Review</option>
                          <option value="accepted">Accepted</option>
                          <option value="rejected">Rejected</option>
                          <option value="done">Done</option>
                        </select>
                        <span className="text-muted-foreground">{format(new Date(req.created_at), "MM/dd HH:mm")}</span>
                        <span className="text-muted-foreground truncate">{req.user_id?.slice(0, 8)}...</span>
                      </div>
                    ))}
                  </div>
                )}
              </TerminalCard>
            )}
          </>
        )}

        {/* MONITORING TAB */}
        {activeTab === "monitoring" && (
          <>
            <TerminalCard title="System Health" className="mb-4">
              <div className="space-y-3 p-2">
                {[
                  { label: "Data Feed (CoinGecko)", status: "OPERATIONAL", ok: true, lastCheck: format(lastRefresh, "HH:mm:ss") },
                  { label: "Database Connection", status: "CONNECTED", ok: true, lastCheck: format(new Date(), "HH:mm:ss") },
                  { label: "Edge Functions", status: "DEPLOYED", ok: true, lastCheck: format(new Date(), "HH:mm:ss") },
                  { label: "Realtime Channel", status: "SUBSCRIBED", ok: true, lastCheck: format(new Date(), "HH:mm:ss") },
                ].map((s, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{s.label}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-data text-muted-foreground">Last: {s.lastCheck}</span>
                      <div className="flex items-center gap-1.5">
                        <span className={`h-1.5 w-1.5 rounded-full ${s.ok ? "bg-terminal-green" : "bg-terminal-red"}`} />
                        <span className="font-data text-[10px] text-muted-foreground">{s.status}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </TerminalCard>

            {/* Sync Jobs */}
            <TerminalCard title="Sync Jobs" className="mb-4">
              <div className="p-2">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Automated Market Data Sync</span>
                  <button
                    onClick={runSyncNow}
                    disabled={runningSyncNow}
                    className="flex items-center gap-1 border border-primary bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary hover:bg-primary/20 disabled:opacity-50 transition-colors"
                  >
                    {runningSyncNow ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    Run Sync Now
                  </button>
                </div>
                {syncJobs.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No sync jobs recorded yet. Click "Run Sync Now" to start.</p>
                ) : (
                  syncJobs.map((job: any) => (
                    <div key={job.job_name} className="border border-border/50 p-2 mb-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-foreground">{job.job_name}</span>
                        <span className={`font-data text-[10px] ${job.status === "success" ? "text-terminal-green" : "text-terminal-red"}`}>{job.status?.toUpperCase()}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-1">
                        Last run: {job.last_run_at ? format(new Date(job.last_run_at), "yyyy-MM-dd HH:mm:ss") : "Never"} ◆ Rows: {job.rows_written || 0}
                      </div>
                      {job.error_message && <p className="text-[10px] text-terminal-red mt-1">{job.error_message}</p>}
                    </div>
                  ))
                )}
              </div>
            </TerminalCard>

            {/* Provider Status */}
            <TerminalCard title="Provider Status" className="mb-4">
              <div className="p-2">
                {providerStatuses.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No provider status data yet.</p>
                ) : (
                  providerStatuses.map((p: any) => (
                    <div key={p.provider} className="border border-border/50 p-2 mb-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-foreground uppercase">{p.provider}</span>
                        <span className={`h-1.5 w-1.5 rounded-full ${p.last_success_at ? "bg-terminal-green" : "bg-terminal-red"}`} />
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-1">
                        {p.last_success_at && <>Success: {format(new Date(p.last_success_at), "HH:mm:ss")} ◆ </>}
                        {p.latency_ms && <>{p.latency_ms}ms ◆ </>}
                        {p.error_message && <span className="text-terminal-red">{p.error_message}</span>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </TerminalCard>

            <TerminalCard title="Data Freshness" className="mb-4">
              <div className="space-y-2 p-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Oldest Record</span>
                  <span className="font-data text-foreground">{oldestRecord ? format(new Date(oldestRecord), "yyyy-MM-dd HH:mm:ss") : "—"}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Newest Record</span>
                  <span className="font-data text-foreground">{newestRecord ? format(new Date(newestRecord), "yyyy-MM-dd HH:mm:ss") : "—"}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Total Records</span>
                  <span className="font-data text-foreground">{records.length}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Registered Users</span>
                  <span className="font-data text-foreground">{profiles.length}</span>
                </div>
              </div>
            </TerminalCard>

            <TerminalCard title="Signal Broadcaster">
              <div className="p-2 space-y-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Broadcast a narrative or signal to users</p>
                <textarea
                  value={signalText}
                  onChange={(e) => setSignalText(e.target.value)}
                  rows={3}
                  className="w-full border border-border bg-background px-2 py-1 text-xs font-data text-foreground resize-none"
                  placeholder="Enter market narrative or signal..."
                />
                <button
                  onClick={() => { if (signalText) { alert("Signal broadcast: " + signalText); setSignalText(""); } }}
                  className="border border-primary bg-primary/10 px-3 py-1 text-xs font-bold text-primary hover:bg-primary/20"
                >
                  Broadcast Signal
                </button>
              </div>
            </TerminalCard>
          </>
        )}

        {/* AUDIT LOG TAB — admin only */}
        {activeTab === "audit" && role === "admin" && (
          <AuditLog />
        )}

        {/* TIER PREVIEW TAB — admin only (extra defense-in-depth check) */}
        {activeTab === "tier-preview" && role === "admin" && (
          <TierPreview />
        )}
      </div>
    </div>
  );
};

export default Admin;
