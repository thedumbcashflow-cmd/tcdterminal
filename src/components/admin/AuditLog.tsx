import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import TerminalCard from "@/components/TerminalCard";
import { format } from "date-fns";
import { Loader2, Download, RefreshCw, Bell, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface AuditRow {
  id: string;
  created_at: string;
  actor_user_id: string | null;
  actor_name?: string | null;
  action: string;
  target_table: string;
  target_id: string | null;
  old_values: any;
  new_values: any;
}

const ACTIONS = [
  "role_grant",
  "role_revoke",
  "intel_create",
  "intel_topic_change",
  "intel_delete",
];

const PAGE_SIZE = 50;

const toCSV = (rows: AuditRow[]): string => {
  const header = ["created_at", "action", "actor_user_id", "actor_name", "target_table", "target_id", "old_values", "new_values"];
  const escape = (v: any) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "string" ? v : JSON.stringify(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  const lines = rows.map((r) =>
    [r.created_at, r.action, r.actor_user_id, r.actor_name, r.target_table, r.target_id, r.old_values, r.new_values]
      .map(escape)
      .join(",")
  );
  return [header.join(","), ...lines].join("\n");
};

const downloadFile = (filename: string, content: string, mime: string) => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// Compute keys present in either side
const diffKeys = (a: any, b: any): string[] => {
  const keys = new Set<string>();
  if (a && typeof a === "object") Object.keys(a).forEach((k) => keys.add(k));
  if (b && typeof b === "object") Object.keys(b).forEach((k) => keys.add(k));
  return Array.from(keys);
};

const fmtVal = (v: any) => {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v;
  return JSON.stringify(v);
};

const DiffView = ({ oldVals, newVals }: { oldVals: any; newVals: any }) => {
  if (!oldVals && !newVals) return <span className="text-muted-foreground">—</span>;

  // Pure add (insert) or pure delete: render single column
  if (!oldVals && newVals) {
    const keys = diffKeys(null, newVals);
    return (
      <div className="space-y-0.5">
        {keys.map((k) => (
          <div key={k} className="flex gap-1.5 text-[11px]">
            <span className="text-muted-foreground w-20 truncate" title={k}>{k}</span>
            <span className="text-terminal-green/90 break-all">+ {fmtVal(newVals[k])}</span>
          </div>
        ))}
      </div>
    );
  }
  if (oldVals && !newVals) {
    const keys = diffKeys(oldVals, null);
    return (
      <div className="space-y-0.5">
        {keys.map((k) => (
          <div key={k} className="flex gap-1.5 text-[11px]">
            <span className="text-muted-foreground w-20 truncate" title={k}>{k}</span>
            <span className="text-terminal-red/90 break-all">- {fmtVal(oldVals[k])}</span>
          </div>
        ))}
      </div>
    );
  }

  const keys = diffKeys(oldVals, newVals);
  const changed = keys.filter((k) => JSON.stringify(oldVals?.[k]) !== JSON.stringify(newVals?.[k]));
  if (changed.length === 0) return <span className="text-muted-foreground text-[11px]">no field changes</span>;

  return (
    <div className="space-y-0.5">
      {changed.map((k) => (
        <div key={k} className="flex flex-col gap-0 text-[11px] leading-tight">
          <span className="text-muted-foreground/80 uppercase tracking-wider text-[9px]">{k}</span>
          <div className="flex gap-2">
            <span className="text-terminal-red/90 break-all">- {fmtVal(oldVals?.[k])}</span>
            <span className="text-terminal-green/90 break-all">+ {fmtVal(newVals?.[k])}</span>
          </div>
        </div>
      ))}
    </div>
  );
};

const AuditLog = () => {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actorFilter, setActorFilter] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const today = new Date();
  const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const [fromDate, setFromDate] = useState(format(sevenDaysAgo, "yyyy-MM-dd"));
  const [toDate, setToDate] = useState(format(today, "yyyy-MM-dd"));
  const [profileMap, setProfileMap] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const filtersKey = useRef("");

  const fetchProfiles = useCallback(async () => {
    const { data } = await supabase.from("profiles").select("id, username, display_name");
    const map: Record<string, string> = {};
    (data || []).forEach((p: any) => {
      map[p.id] = p.display_name || p.username || p.id.slice(0, 8);
    });
    setProfileMap(map);
  }, []);

  const fetchPage = useCallback(async (pageNum: number) => {
    setLoading(true);
    const fromIso = fromDate ? new Date(fromDate + "T00:00:00").toISOString() : null;
    const toIso = toDate ? new Date(toDate + "T23:59:59").toISOString() : null;
    const { data, error } = await supabase.rpc("search_admin_audit_log" as any, {
      p_search: searchTerm || null,
      p_action: actionFilter || null,
      p_actor: actorFilter || null,
      p_from: fromIso,
      p_to: toIso,
      p_limit: PAGE_SIZE,
      p_offset: pageNum * PAGE_SIZE,
    } as any);
    if (error) {
      toast({ title: "Failed to load audit log", description: error.message, variant: "destructive" });
      setRows([]);
      setTotalCount(0);
    } else {
      const list = (data as any[]) || [];
      setRows(list as AuditRow[]);
      setTotalCount(list.length > 0 ? Number(list[0].total_count || 0) : 0);
    }
    setLoading(false);
  }, [fromDate, toDate, actionFilter, actorFilter, searchTerm]);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  // Reset page when filters change
  useEffect(() => {
    const key = JSON.stringify({ fromDate, toDate, actionFilter, actorFilter, searchTerm });
    if (filtersKey.current !== key) {
      filtersKey.current = key;
      setPage(0);
      fetchPage(0);
    }
  }, [fromDate, toDate, actionFilter, actorFilter, searchTerm, fetchPage]);

  // Realtime subscription — admins receive live notifications.
  // Only prepend new rows when on page 0 and viewing the default time range so
  // the displayed page does not change unexpectedly.
  useEffect(() => {
    const channel = supabase
      .channel("admin-audit-log-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "admin_audit_log" },
        (payload) => {
          const r = payload.new as AuditRow;
          const actorName = (r.actor_user_id && profileMap[r.actor_user_id]) || r.actor_user_id?.slice(0, 8) || "system";
          toast({
            title: `Audit: ${r.action}`,
            description: `${actorName} → ${r.target_table}${r.target_id ? ` (${r.target_id.slice(0, 8)})` : ""}`,
          });
          if (page === 0) {
            setRows((prev) => [{ ...r, actor_name: actorName }, ...prev].slice(0, PAGE_SIZE));
            setTotalCount((c) => c + 1);
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [profileMap, page]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const canPrev = page > 0;
  const canNext = page + 1 < totalPages;

  const exportCSV = () => {
    downloadFile(`audit-log_${fromDate}_to_${toDate}_p${page + 1}.csv`, toCSV(rows), "text/csv");
  };

  const exportJSON = () => {
    downloadFile(
      `audit-log_${fromDate}_to_${toDate}_p${page + 1}.json`,
      JSON.stringify({ exported_at: new Date().toISOString(), filters: { fromDate, toDate, actionFilter, actorFilter, searchTerm }, page: page + 1, count: rows.length, total: totalCount, rows }, null, 2),
      "application/json"
    );
  };

  const actorOptions = useMemo(() => Object.entries(profileMap), [profileMap]);

  return (
    <div className="space-y-3">
      <TerminalCard title="Filters">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 p-2">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">From</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="mt-1 w-full border border-border bg-background px-2 py-1 text-xs font-data text-foreground"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">To</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="mt-1 w-full border border-border bg-background px-2 py-1 text-xs font-data text-foreground"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Action</label>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="mt-1 w-full border border-border bg-background px-2 py-1 text-xs font-data text-foreground"
            >
              <option value="">All</option>
              {ACTIONS.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Actor</label>
            <select
              value={actorFilter}
              onChange={(e) => setActorFilter(e.target.value)}
              className="mt-1 w-full border border-border bg-background px-2 py-1 text-xs font-data text-foreground"
            >
              <option value="">All actors</option>
              {actorOptions.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Search className="h-3 w-3" /> Search (actor / action / target / JSON)
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="e.g. role_grant, asset_symbol, SOL, premium"
              className="mt-1 w-full border border-border bg-background px-2 py-1 text-xs font-data text-foreground"
            />
          </div>
        </div>
      </TerminalCard>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3 text-[10px] font-data text-muted-foreground uppercase tracking-wider">
          <span className="flex items-center gap-1">
            <Bell className="h-3 w-3 text-terminal-green animate-pulse" />
            Live
          </span>
          <span>{totalCount} entries · page {page + 1} of {totalPages}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchPage(page)}
            className="border border-border px-2 py-1 text-xs hover:text-primary transition-colors flex items-center gap-1"
            title="Refresh"
          >
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
          <button
            onClick={() => { const p = Math.max(0, page - 1); setPage(p); fetchPage(p); }}
            disabled={!canPrev || loading}
            className="border border-border px-2 py-1 text-xs hover:text-primary transition-colors flex items-center gap-1 disabled:opacity-40"
          >
            <ChevronLeft className="h-3 w-3" /> Prev
          </button>
          <button
            onClick={() => { const p = page + 1; setPage(p); fetchPage(p); }}
            disabled={!canNext || loading}
            className="border border-border px-2 py-1 text-xs hover:text-primary transition-colors flex items-center gap-1 disabled:opacity-40"
          >
            Next <ChevronRight className="h-3 w-3" />
          </button>
          <button
            onClick={exportCSV}
            disabled={rows.length === 0}
            className="border border-border px-2 py-1 text-xs hover:text-primary transition-colors flex items-center gap-1 disabled:opacity-50"
          >
            <Download className="h-3 w-3" /> CSV
          </button>
          <button
            onClick={exportJSON}
            disabled={rows.length === 0}
            className="border border-border px-2 py-1 text-xs hover:text-primary transition-colors flex items-center gap-1 disabled:opacity-50"
          >
            <Download className="h-3 w-3" /> JSON
          </button>
        </div>
      </div>

      <TerminalCard title={`Audit Log`}>
        <div className="overflow-x-auto">
          <div className="grid grid-cols-12 border-b border-border px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground min-w-[900px]">
            <span className="col-span-2">Time</span>
            <span className="col-span-2">Action</span>
            <span className="col-span-2">Actor</span>
            <span className="col-span-2">Target</span>
            <span className="col-span-4">Diff</span>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            </div>
          ) : rows.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">No audit entries match the filters.</div>
          ) : (
            rows.map((r) => {
              const actorName = r.actor_name || (r.actor_user_id && profileMap[r.actor_user_id]) || (r.actor_user_id ? r.actor_user_id.slice(0, 8) : "system");
              const isPremiumChange = r.action === "intel_topic_change";
              const isRoleChange = r.action === "role_grant" || r.action === "role_revoke";
              const colorClass = isRoleChange
                ? "text-amber-400"
                : isPremiumChange
                ? "text-primary"
                : r.action === "intel_delete"
                ? "text-terminal-red"
                : "text-terminal-green";
              return (
                <div key={r.id} className="grid grid-cols-12 border-b border-border/30 px-2 py-1.5 font-data text-[11px] hover:bg-secondary/30 transition-colors items-start min-w-[900px]">
                  <span className="col-span-2 text-muted-foreground">{format(new Date(r.created_at), "yyyy-MM-dd HH:mm:ss")}</span>
                  <span className={`col-span-2 uppercase font-bold ${colorClass}`}>{r.action}</span>
                  <span className="col-span-2 text-foreground truncate" title={r.actor_user_id || ""}>{actorName}</span>
                  <span className="col-span-2 text-muted-foreground truncate" title={r.target_id || ""}>
                    {r.target_table}
                    {r.target_id ? <span className="text-foreground/60"> · {r.target_id.slice(0, 8)}</span> : null}
                  </span>
                  <div className="col-span-4">
                    <DiffView oldVals={r.old_values} newVals={r.new_values} />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </TerminalCard>
    </div>
  );
};

export default AuditLog;
