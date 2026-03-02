import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startTime = Date.now();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const results: Record<string, { success: boolean; rows?: number; error?: string }> = {};

  // 1. Sync CoinGecko prices (provider: coingecko)
  try {
    const coinIds = "solana,bitcoin,ethereum,jupiter-exchange-solana,bonk,raydium,pyth-network";
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinIds}&vs_currencies=usd&include_24hr_change=true`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      const latency = Date.now() - startTime;
      await supabase.from("provider_status").upsert({
        provider: "coingecko",
        last_success_at: new Date().toISOString(),
        latency_ms: latency,
        error_message: null,
      }, { onConflict: "provider" });
      results.coingecko = { success: true, rows: Object.keys(data).length };
    } else {
      const errText = await res.text();
      await supabase.from("provider_status").upsert({
        provider: "coingecko",
        last_error_at: new Date().toISOString(),
        error_message: `HTTP ${res.status}: ${errText.slice(0, 200)}`,
      }, { onConflict: "provider" });
      results.coingecko = { success: false, error: `HTTP ${res.status}` };
    }
  } catch (e) {
    await supabase.from("provider_status").upsert({
      provider: "coingecko",
      last_error_at: new Date().toISOString(),
      error_message: e instanceof Error ? e.message : "Unknown error",
    }, { onConflict: "provider" });
    results.coingecko = { success: false, error: e instanceof Error ? e.message : "Unknown" };
  }

  // 2. Check market_intel freshness (provider: market_intel)
  try {
    const { count } = await supabase.from("market_intel").select("*", { count: "exact", head: true });
    await supabase.from("provider_status").upsert({
      provider: "market_intel",
      last_success_at: new Date().toISOString(),
      latency_ms: Date.now() - startTime,
      error_message: null,
    }, { onConflict: "provider" });
    results.market_intel = { success: true, rows: count || 0 };
  } catch (e) {
    results.market_intel = { success: false, error: e instanceof Error ? e.message : "Unknown" };
  }

  // Update sync_jobs
  const totalRows = Object.values(results).reduce((sum, r) => sum + (r.rows || 0), 0);
  const allSuccess = Object.values(results).every(r => r.success);

  await supabase.from("sync_jobs").upsert({
    job_name: "sync-market-data",
    last_run_at: new Date().toISOString(),
    rows_written: totalRows,
    status: allSuccess ? "success" : "partial_failure",
    error_message: allSuccess ? null : JSON.stringify(Object.fromEntries(Object.entries(results).filter(([, v]) => !v.success))),
  }, { onConflict: "job_name" });

  return new Response(JSON.stringify({ results, duration_ms: Date.now() - startTime }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
