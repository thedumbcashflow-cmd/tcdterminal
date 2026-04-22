import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import TerminalCard from "@/components/TerminalCard";
import { Loader2, Search, RotateCcw, AlertTriangle } from "lucide-react";
import { format } from "date-fns";

// ===== ACCESS ENFORCEMENT TESTS =====
// ASSERT: GET /admin/tier-preview as role='moderator' → 403 (component returns null + redirect)
// ASSERT: GET /admin/tier-preview as role='admin'     → 200 (full UI)
// Server-side defense: market_intel RLS policy enforces is_premium gating against
// auth.uid() via get_subscription_tier() — non-admins cannot bypass by URL hacking.

type SimTier = "free" | "trial" | "pro";

interface LoadedUser {
  id: string;
  username: string | null;
  display_name: string | null;
  subscription_tier: string;
}

interface IntelRow {
  id: string;
  asset_symbol: string;
  intel_type: string | null;
  is_premium: boolean;
  created_at: string;
}

const PAGE_SIZE = 25;
const SESSION_KEY = "tier_preview_state";

interface PersistedState {
  email: string;
  simTier: SimTier | null;
  userId: string | null;
}

const TIER_LABEL: Record<SimTier, string> = {
  free: "Free user",
  trial: "Trial user",
  pro: "Pro user",
};

const TierPreview = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  // Server-side admin re-verification on mount.
  const [accessChecked, setAccessChecked] = useState(false);
  const [accessGranted, setAccessGranted] = useState(false);

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<LoadedUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [simTier, setSimTier] = useState<SimTier | null>(null);
  const [rows, setRows] = useState<IntelRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [previewLoading, setPreviewLoading] = useState(false);
  const restoredRef = useRef(false);

  // Verify admin role server-side at mount (defense-in-depth)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        if (!cancelled) {
          toast({ title: "Not authorised", description: "Please sign in.", variant: "destructive" });
          navigate("/auth");
        }
        return;
      }
      const { data: isAdmin } = await supabase.rpc("has_role", {
        _user_id: authUser.id,
        _role: "admin",
      });
      if (cancelled) return;
      if (!isAdmin) {
        toast({ title: "Not authorised", description: "Admin role required.", variant: "destructive" });
        navigate("/admin");
        return;
      }
      setAccessGranted(true);
      setAccessChecked(true);
    })();
    return () => { cancelled = true; };
  }, [navigate, toast]);

  // Restore session state once access granted
  useEffect(() => {
    if (!accessGranted || restoredRef.current) return;
    restoredRef.current = true;
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return;
      const persisted = JSON.parse(raw) as PersistedState;
      if (persisted.email) setEmail(persisted.email);
      if (persisted.userId && persisted.email) {
        // Re-load user + simulation
        (async () => {
          const { data } = await supabase
            .from("profiles")
            .select("id, username, display_name, subscription_tier")
            .eq("id", persisted.userId!)
            .maybeSingle();
          if (data) {
            setUser(data as LoadedUser);
            const tier = (persisted.simTier ?? (data.subscription_tier as SimTier)) as SimTier;
            setSimTier(tier);
            runSimulation(tier, 0);
          }
        })();
      }
    } catch {
      // ignore corrupt sessionStorage
    }
  }, [accessGranted]);

  const persist = (next: Partial<PersistedState>) => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      const prev = raw ? (JSON.parse(raw) as PersistedState) : { email: "", simTier: null, userId: null };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...prev, ...next }));
    } catch { /* noop */ }
  };

  const reset = () => {
    setEmail("");
    setUser(null);
    setSimTier(null);
    setRows([]);
    setTotalCount(0);
    setPage(0);
    setError(null);
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* noop */ }
  };

  const loadUser = async () => {
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    setUser(null);
    setSimTier(null);
    setRows([]);

    try {
      const localPart = email.split("@")[0].trim();
      const { data, error: qErr } = await supabase
        .from("profiles")
        .select("id, username, display_name, subscription_tier")
        .or(`username.ilike.%${localPart}%,display_name.ilike.%${localPart}%`)
        .limit(1)
        .maybeSingle();

      if (qErr) throw qErr;
      if (!data) {
        setError(`No profile found matching "${email}".`);
      } else {
        const loaded = data as LoadedUser;
        setUser(loaded);
        // Default sim tier = user's actual tier (clamped to allowed sim values)
        const actual = loaded.subscription_tier as string;
        const defaultTier: SimTier =
          actual === "pro" || actual === "whale" ? "pro" :
          actual === "trial" ? "trial" : "free";
        setSimTier(defaultTier);
        persist({ email, userId: loaded.id, simTier: defaultTier });
        runSimulation(defaultTier, 0);
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load user");
    } finally {
      setLoading(false);
    }
  };

  const runSimulation = async (tier: SimTier, pageNum: number) => {
    setPreviewLoading(true);
    setError(null);

    try {
      let query = supabase
        .from("market_intel")
        .select("id, asset_symbol, intel_type, is_premium, created_at", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(pageNum * PAGE_SIZE, pageNum * PAGE_SIZE + PAGE_SIZE - 1);

      // Simulated tier filter — mirrors the RLS policy. Free → no premium rows.
      if (tier === "free") query = query.eq("is_premium", false);

      const { data, count, error: qErr } = await query;
      if (qErr) throw qErr;
      setRows((data as IntelRow[]) || []);
      setTotalCount(count || 0);
    } catch (e: any) {
      setError(e?.message || "Failed to run simulation");
    } finally {
      setPreviewLoading(false);
    }
  };

  const onTierChange = (tier: SimTier) => {
    setSimTier(tier);
    setPage(0);
    persist({ simTier: tier });
    runSimulation(tier, 0);
  };

  const changePage = (newPage: number) => {
    if (!simTier) return;
    setPage(newPage);
    runSimulation(simTier, newPage);
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  if (!accessChecked) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }
  if (!accessGranted) return null;

  return (
    <div className="space-y-4">
      <div className="border border-amber-500/40 bg-amber-500/10 px-3 py-2 flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-amber-200">
          <span className="font-bold uppercase tracking-wider">Dev tool — simulation only.</span>{" "}
          No database changes are made. This previews what <em>market_intel</em> rows a user at the selected tier would see.
        </p>
      </div>

      <TerminalCard title="1. Load User">
        <div className="p-2 flex flex-col sm:flex-row gap-2">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") loadUser(); }}
            placeholder="user@example.com or username"
            className="flex-1 border border-border bg-background px-2 py-1.5 text-xs font-data text-foreground"
          />
          <button
            onClick={loadUser}
            disabled={loading || !email.trim()}
            className="flex items-center justify-center gap-1 border border-primary bg-primary/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-primary hover:bg-primary/20 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
            Load User
          </button>
          <button
            onClick={reset}
            className="flex items-center justify-center gap-1 border border-border bg-background px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </button>
        </div>
        {error && <p className="px-3 pb-2 text-xs text-terminal-red">{error}</p>}
        {user && (
          <div className="border-t border-border px-3 py-2 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-data">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground block">Name</span>
              <span className="text-foreground">{user.display_name || user.username || "—"}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground block">Current Tier</span>
              <span className="text-primary uppercase">{user.subscription_tier}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground block">User ID</span>
              <span className="text-muted-foreground truncate block">{user.id}</span>
            </div>
          </div>
        )}
      </TerminalCard>

      {user && (
        <TerminalCard title="2. Simulate Tier">
          <div className="p-2 flex items-center gap-3">
            <label htmlFor="sim-tier-select" className="text-[10px] uppercase tracking-wider text-muted-foreground font-data">
              View as
            </label>
            <select
              id="sim-tier-select"
              value={simTier ?? ""}
              onChange={(e) => onTierChange(e.target.value as SimTier)}
              className="border border-border bg-background px-2 py-1.5 text-xs font-data text-foreground"
            >
              {(["free", "trial", "pro"] as SimTier[]).map((t) => (
                <option key={t} value={t}>{TIER_LABEL[t]}</option>
              ))}
            </select>
          </div>
        </TerminalCard>
      )}

      {simTier && (
        <TerminalCard
          title={`3. Live Preview — ${rows.length} of ${totalCount} rows visible at "${TIER_LABEL[simTier]}" level`}
        >
          <div className="overflow-x-auto">
            <div className="grid grid-cols-5 border-b border-border px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground min-w-[600px]">
              <span>ID</span><span>Asset</span><span>Intel Type</span><span>Premium</span><span>Created</span>
            </div>
            {previewLoading ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-primary" /></div>
            ) : rows.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">No rows visible at this tier.</div>
            ) : (
              rows.map((r) => (
                <div key={r.id} className="grid grid-cols-5 border-b border-border/30 px-2 py-1 font-data text-xs items-center min-w-[600px]">
                  <span className="text-muted-foreground truncate">{r.id.slice(0, 8)}</span>
                  <span className="font-bold text-foreground">{r.asset_symbol}</span>
                  <span className="text-muted-foreground">{r.intel_type || "—"}</span>
                  <span className={r.is_premium ? "text-primary" : "text-muted-foreground"}>{r.is_premium ? "YES" : "NO"}</span>
                  <span className="text-muted-foreground">{format(new Date(r.created_at), "MM/dd HH:mm")}</span>
                </div>
              ))
            )}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs font-data">
              <span className="text-muted-foreground">Page {page + 1} / {totalPages}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => changePage(Math.max(0, page - 1))}
                  disabled={page === 0 || previewLoading}
                  className="border border-border px-2 py-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  Prev
                </button>
                <button
                  onClick={() => changePage(Math.min(totalPages - 1, page + 1))}
                  disabled={page >= totalPages - 1 || previewLoading}
                  className="border border-border px-2 py-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </TerminalCard>
      )}
    </div>
  );
};

export default TierPreview;
