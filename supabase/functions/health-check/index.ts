// Live system health probes for the dashboard. Checks Helius RPC and Sheet
// Sync freshness without exposing admin-only tables to the client.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function probeHelius() {
  const key = Deno.env.get("HELIUS_API_KEY");
  const url = key
    ? `https://mainnet.helius-rpc.com/?api-key=${key}`
    : "https://api.mainnet-beta.solana.com";
  const label = key ? "Helius" : "Solana RPC (fallback)";
  const t0 = Date.now();
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
      signal: ctrl.signal,
    });
    clearTimeout(to);
    const latencyMs = Date.now() - t0;
    if (!res.ok) return { ok: false, status: "ERROR", latencyMs, detail: `${label} ${res.status}` };
    const body = await res.json();
    const ok = body?.result === "ok";
    return { ok, status: ok ? (key ? "CONNECTED" : "FALLBACK") : "DEGRADED", latencyMs, detail: label };
  } catch (e) {
    return { ok: false, status: "OFFLINE", latencyMs: null, detail: String(e) };
  }
}

async function probeSheetSync() {
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data, error } = await admin
      .from("sync_jobs")
      .select("job_name,last_run_at,status,error_message")
      .order("last_run_at", { ascending: false })
      .limit(5);
    if (error) return { ok: false, status: "ERROR", lastRunAt: null, ageSec: null, detail: error.message };
    if (!data || data.length === 0) return { ok: false, status: "NO RUNS", lastRunAt: null, ageSec: null };
    const last = data[0];
    if (!last.last_run_at) return { ok: false, status: "PENDING", lastRunAt: null, ageSec: null };
    const ageSec = Math.floor((Date.now() - new Date(last.last_run_at).getTime()) / 1000);
    const anyError = data.some((d) => d.status === "error" || !!d.error_message);
    const stale = ageSec > 30 * 60;
    const ok = !anyError && !stale && last.status !== "error";
    let status = "CONNECTED";
    if (anyError) status = "ERROR";
    else if (stale) status = "STALE";
    else if (ageSec < 60) status = `LAST: ${ageSec}s AGO`;
    else if (ageSec < 3600) status = `LAST: ${Math.floor(ageSec / 60)}m AGO`;
    else status = `LAST: ${Math.floor(ageSec / 3600)}h AGO`;
    return { ok, status, lastRunAt: last.last_run_at, ageSec };
  } catch (e) {
    return { ok: false, status: "OFFLINE", lastRunAt: null, ageSec: null, detail: String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: claims, error: authErr } = await supabase.auth.getClaims(authHeader.replace("Bearer ", ""));
  if (authErr || !claims?.claims) return json(401, { error: "Unauthorized" });

  const [helius, sheetSync] = await Promise.all([probeHelius(), probeSheetSync()]);
  return json(200, { helius, sheetSync, checkedAt: new Date().toISOString() });
});
