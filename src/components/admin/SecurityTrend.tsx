import { useEffect, useMemo, useState } from "react";
import historyJson from "../../../docs/security/scan-history.json";

type Run = {
  ts: string;
  commit: string | null;
  pr: number | null;
  status: "pass" | "fail" | "unknown";
  severity: { high: number; medium: number; low: number };
};

type History = { runs: Run[] };

const SecurityTrend = () => {
  const [runs, setRuns] = useState<Run[]>([]);

  useEffect(() => {
    const data = historyJson as History;
    setRuns(Array.isArray(data?.runs) ? data.runs : []);
  }, []);

  const totals = useMemo(() => {
    const passed = runs.filter((r) => r.status === "pass").length;
    const failed = runs.filter((r) => r.status === "fail").length;
    const high = runs.reduce((s, r) => s + (r.severity?.high ?? 0), 0);
    const last = runs.at(-1);
    return { passed, failed, high, last };
  }, [runs]);

  // Sparkline: high-severity count across the last 30 runs.
  const series = runs.slice(-30).map((r) => r.severity?.high ?? 0);
  const max = Math.max(1, ...series);
  const W = 600;
  const H = 80;
  const step = series.length > 1 ? W / (series.length - 1) : W;
  const path = series
    .map((v, i) => `${i === 0 ? "M" : "L"} ${i * step} ${H - (v / max) * (H - 4) - 2}`)
    .join(" ");

  return (
    <div className="border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground">Security Scan Trend</h2>
          <p className="text-[10px] text-muted-foreground/70 font-data">
            Source: <code>docs/security/scan-history.json</code> · appended by CI
          </p>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-data uppercase">
          <span className="text-emerald-400">{totals.passed} pass</span>
          <span className="text-red-400">{totals.failed} fail</span>
          <span className="text-amber-400">Σ {totals.high} high-sev</span>
        </div>
      </div>

      {runs.length === 0 ? (
        <div className="text-xs text-muted-foreground py-8 text-center font-data">
          No scan runs recorded yet. CI appends to <code>scan-history.json</code> on every push to main.
        </div>
      ) : (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-20 border border-border bg-background">
            <path d={path} fill="none" stroke="#FFA028" strokeWidth="1.5" />
            {series.map((v, i) => (
              <circle
                key={i}
                cx={i * step}
                cy={H - (v / max) * (H - 4) - 2}
                r={v > 0 ? 2.5 : 1.5}
                fill={v > 0 ? "#ef4444" : "#0068ff"}
              />
            ))}
          </svg>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-[11px] font-data">
              <thead>
                <tr className="text-[10px] uppercase text-muted-foreground border-b border-border">
                  <th className="text-left py-1 pr-2">Date</th>
                  <th className="text-left py-1 pr-2">Commit</th>
                  <th className="text-left py-1 pr-2">PR</th>
                  <th className="text-right py-1 pr-2">High</th>
                  <th className="text-right py-1 pr-2">Med</th>
                  <th className="text-right py-1 pr-2">Low</th>
                  <th className="text-left py-1">Status</th>
                </tr>
              </thead>
              <tbody>
                {[...runs].slice(-20).reverse().map((r) => (
                  <tr key={`${r.ts}-${r.commit ?? ""}`} className="border-b border-border/40">
                    <td className="py-1 pr-2">{new Date(r.ts).toISOString().slice(0, 16).replace("T", " ")}</td>
                    <td className="py-1 pr-2 text-muted-foreground">{r.commit ?? "—"}</td>
                    <td className="py-1 pr-2 text-muted-foreground">{r.pr ?? "—"}</td>
                    <td className={`py-1 pr-2 text-right ${r.severity?.high > 0 ? "text-red-400" : "text-emerald-400"}`}>
                      {r.severity?.high ?? 0}
                    </td>
                    <td className="py-1 pr-2 text-right">{r.severity?.medium ?? 0}</td>
                    <td className="py-1 pr-2 text-right">{r.severity?.low ?? 0}</td>
                    <td className={`py-1 ${r.status === "pass" ? "text-emerald-400" : r.status === "fail" ? "text-red-400" : "text-muted-foreground"}`}>
                      {r.status?.toUpperCase()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default SecurityTrend;
