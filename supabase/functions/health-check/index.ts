// Live system health probes for the dashboard. Probes Helius RPC + Sheet
// Sync freshness, persists outcomes to provider_status (so the panel has
// history across cold starts), and returns lastSuccessAt + lastErrorAt +
// errorMessage so the UI can show specific reasons per source.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const admin = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function persistStatus(provider: string, ok: boolean, latencyMs: number | null, errorMessage: string | null) {
  try {
    const now = new Date().toISOString();
    const row: Record<string, unknown> = {
      provider,
      latency_ms: latencyMs,
      error_message: ok ? null : (errorMessage ?? "unknown error"),
    };
    if (ok) row.last_success_at = now;
    else row.last_error_at = now;
    await admin().from("provider_status").upsert(row, { onConflict: "provider" });
  } catch (e) {
    console.log(JSON.stringify({ persistStatusFailed: provider, err: String(e) }));
  }
}

async function readHistory(provider: string) {
  try {
    const { data } = await admin().from("provider_status").select("*").eq("provider", provider).maybeSingle();
    return data ?? null;
  } catch { return null; }
}

async function probeHelius() {
  const key = Deno.env.get("HELIUS_API_KEY");
  const url = key
    ? `https://mainnet.helius-rpc.com/?api-key=${key}`
    : "https://api.mainnet-beta.solana.com";
  const label = key ? "Helius" : "Solana RPC (fallback)";
  const t0 = Date.now();
  let ok = false, status = "OFFLINE", err: string | null = null, latencyMs: number | null = null;
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
    latencyMs = Date.now() - t0;
    if (!res.ok) { status = "ERROR"; err = `${label} HTTP ${res.status}`; }
    else {
      const body = await res.json();
      ok = body?.result === "ok";
      status = ok ? (key ? "CONNECTED" : "FALLBACK") : "DEGRADED";
      if (!ok) err = `${label} reports degraded`;
    }
  } catch (e) {
    err = `${label}: ${(e as Error)?.message || String(e)}`;
    status = "OFFLINE";
  }
  await persistStatus("helius", ok, latencyMs, err);
  const hist = await readHistory("helius");
  return { ok, status, latencyMs, detail: label, errorMessage: err,
    lastSuccessAt: hist?.last_success_at ?? null, lastErrorAt: hist?.last_error_at ?? null };
}

async function probeSheetSync() {
  let ok = false, status = "OFFLINE", err: string | null = null;
  let lastRunAt: string | null = null, ageSec: number | null = null;
  try {
    const sb = admin();
    const { data, error } = await sb
      .from("sync_jobs")
      .select("job_name,last_run_at,status,error_message")
      .order("last_run_at", { ascending: false })
      .limit(5);
    if (error) { status = "ERROR"; err = error.message; }
    else if (!data || data.length === 0) { status = "NO RUNS"; err = "No sync jobs recorded"; }
    else {
      const last = data[0];
      if (!last.last_run_at) { status = "PENDING"; err = "Job has not run yet"; }
      else {
        lastRunAt = last.last_run_at;
        ageSec = Math.floor((Date.now() - new Date(last.last_run_at).getTime()) / 1000);
        const anyError = data.some((d) => d.status === "error" || !!d.error_message);
        const stale = ageSec > 30 * 60;
        ok = !anyError && !stale && last.status !== "error";
        if (anyError) { status = "ERROR"; err = data.find((d) => d.error_message)?.error_message || "Job reported error"; }
        else if (stale) { status = "STALE"; err = `Last run ${Math.floor(ageSec / 60)}m ago (>30m)`; }
        else if (ageSec < 60) status = `LAST: ${ageSec}s AGO`;
        else if (ageSec < 3600) status = `LAST: ${Math.floor(ageSec / 60)}m AGO`;
        else status = `LAST: ${Math.floor(ageSec / 3600)}h AGO`;
      }
    }
  } catch (e) {
    err = (e as Error)?.message || String(e);
    status = "OFFLINE";
  }
  await persistStatus("sheet_sync", ok, null, err);
  const hist = await readHistory("sheet_sync");
  return { ok, status, lastRunAt, ageSec, errorMessage: err,
    lastSuccessAt: hist?.last_success_at ?? lastRunAt, lastErrorAt: hist?.last_error_at ?? null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: claims, error: authErr } = await sb.auth.getClaims(authHeader.replace("Bearer ", ""));
  if (authErr || !claims?.claims) return json(401, { error: "Unauthorized" });

  const [helius, sheetSync] = await Promise.all([probeHelius(), probeSheetSync()]);
  return json(200, { helius, sheetSync, checkedAt: new Date().toISOString() });
});
