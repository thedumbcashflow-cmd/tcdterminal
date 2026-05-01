import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import TerminalCard from "@/components/TerminalCard";
import { format } from "date-fns";
import { Loader2, Download, RefreshCw, Bell } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface AuditRow {
  id: string;
  created_at: string;
  actor_user_id: string | null;
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

const toCSV = (rows: AuditRow[]): string => {
  const header = ["created_at", "action", "actor_user_id", "target_table", "target_id", "old_values", "new_values"];
  const escape = (v: any) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "string" ? v : JSON.stringify(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  const lines = rows.map((r) =>
    [r.created_at, r.action, r.actor_user_id, r.target_table, r.target_id, r.old_values, r.new_values]
      .map(escape)
      .join(",")
  );
  return [header.join(","), ...lines].join("\n");
};

const download = (filename: string, content: string, mime: string) => {
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

const AuditLog = () => {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actorFilter, setActorFilter] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("");
  const today = new Date();
  const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const [fromDate, setFromDate] = useState(format(sevenDaysAgo, "yyyy-MM-dd"));
  const [toDate, setToDate] = useState(format(today, "yyyy-MM-dd"));
  const [profileMap, setProfileMap] = useState<Record<string, string>>({});

  const fetchProfiles = useCallback(async () => {
    const { data } = await supabase.from("profiles").select("id, username, display_name");
    const map: Record<string, string> = {};
    (data || []).forEach((p: any) => {
      map[p.id] = p.display_name || p.username || p.id.slice(0, 8);
    });
    setProfileMap(map);
  }, []);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("admin_audit_log" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);

    if (fromDate) q = q.gte("created_at", new Date(fromDate + "T00:00:00").toISOString());
    if (toDate) q = q.lte("created_at", new Date(toDate + "T23:59:59").toISOString());
    if (actionFilter) q = q.eq("action", actionFilter);
    if (actorFilter) q = q.eq("actor_user_id", actorFilter);

    const { data, error } = (await q) as any;
    if (error) {
      toast({ title: "Failed to load audit log", description: error.message, variant: "destructive" });
    }
    setRows(((data as AuditRow[]) || []));
    setLoading(false);
  }, [fromDate, toDate, actionFilter, actorFilter]);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  // Realtime subscription — admins receive live notifications
  useEffect(() => {
    const channel = supabase
      .channel("admin-audit-log-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "admin_audit_log" },
        (payload) => {
          const r = payload.new as AuditRow;
          setRows((prev) => [r, ...prev].slice(0, 500));
          const actorName = (r.actor_user_id && profileMap[r.actor_user_id]) || r.actor_user_id?.slice(0, 8) || "system";
          toast({
            title: `Audit: ${r.action}`,
            description: `${actorName} → ${r.target_table}${r.target_id ? ` (${r.target_id.slice(0, 8)})` : ""}`,
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [profileMap]);

  const filteredCount = rows.length;

  const exportCSV = () => {
    download(`audit-log_${fromDate}_to_${toDate}.csv`, toCSV(rows), "text/csv");
  };

  const exportJSON = () => {
    download(
      `audit-log_${fromDate}_to_${toDate}.json`,
      JSON.stringify({ exported_at: new Date().toISOString(), filters: { fromDate, toDate, actionFilter, actorFilter }, count: rows.length, rows }, null, 2),
      "application/json"
    );
  };

  const actorOptions = useMemo(() => Object.entries(profileMap), [profileMap]);

  return (
    <div className="space-y-3">
      <TerminalCard title="Filters">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 p-2">
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
          <div className="flex items-end gap-1">
            <button
              onClick={fetchRows}
              className="border border-border px-2 py-1 text-xs hover:text-primary transition-colors flex items-center gap-1"
              title="Refresh"
            >
              <RefreshCw className="h-3 w-3" /> Apply
            </button>
          </div>
        </div>
      </TerminalCard>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] font-data text-muted-foreground uppercase tracking-wider">
          <Bell className="h-3 w-3 text-terminal-green animate-pulse" />
          Live notifications enabled · {filteredCount} entries
        </div>
        <div className="flex items-center gap-2">
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

      <TerminalCard title={`Audit Log (${filteredCount})`}>
        <div className="overflow-x-auto">
          <div className="grid grid-cols-12 border-b border-border px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground min-w-[800px]">
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
              const actorName = (r.actor_user_id && profileMap[r.actor_user_id]) || (r.actor_user_id ? r.actor_user_id.slice(0, 8) : "system");
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
                <div key={r.id} className="grid grid-cols-12 border-b border-border/30 px-2 py-1.5 font-data text-[11px] hover:bg-secondary/30 transition-colors items-start min-w-[800px]">
                  <span className="col-span-2 text-muted-foreground">{format(new Date(r.created_at), "yyyy-MM-dd HH:mm:ss")}</span>
                  <span className={`col-span-2 uppercase font-bold ${colorClass}`}>{r.action}</span>
                  <span className="col-span-2 text-foreground truncate" title={r.actor_user_id || ""}>{actorName}</span>
                  <span className="col-span-2 text-muted-foreground truncate" title={r.target_id || ""}>
                    {r.target_table}
                    {r.target_id ? <span className="text-foreground/60"> · {r.target_id.slice(0, 8)}</span> : null}
                  </span>
                  <span className="col-span-4 text-muted-foreground break-words">
                    {r.old_values && (
                      <span className="text-terminal-red/80">- {JSON.stringify(r.old_values)} </span>
                    )}
                    {r.new_values && (
                      <span className="text-terminal-green/80">+ {JSON.stringify(r.new_values)}</span>
                    )}
                  </span>
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
