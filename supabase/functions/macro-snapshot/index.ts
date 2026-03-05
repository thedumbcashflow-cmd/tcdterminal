import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// In-memory cache
let cache: { data: any; ts: number } | null = null;
const CACHE_TTL_MS = 60_000; // 60s

async function fetchFearGreed() {
  try {
    const res = await fetch("https://api.alternative.me/fng/?limit=1", { signal: AbortSignal.timeout(3000) });
    const json = await res.json();
    const d = json?.data?.[0];
    return { value: Number(d?.value ?? 0), label: d?.value_classification ?? "Unknown", source: "alternative.me" };
  } catch {
    return null;
  }
}

async function fetchBtcDominance() {
  try {
    const res = await fetch("https://api.coinpaprika.com/v1/global", { signal: AbortSignal.timeout(3000) });
    const json = await res.json();
    return { value: Number((json?.bitcoin_dominance_percentage ?? 0).toFixed(1)), source: "coinpaprika" };
  } catch {
    return null;
  }
}

async function fetchDxyProxy() {
  // Use a free proxy: DXY approximate from exchangerate. We'll use EUR/USD inverse as rough proxy.
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", { signal: AbortSignal.timeout(3000) });
    const json = await res.json();
    const eurRate = json?.rates?.EUR;
    if (!eurRate) return null;
    // Rough DXY proxy: inverse of EUR/USD scaled. Real DXY ≈ 100 when EUR/USD ≈ 1.08
    const dxyApprox = (1 / eurRate) * 108;
    return { value: Number(dxyApprox.toFixed(1)), label: "USD Index (proxy)", source: "er-api.com" };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Serve from cache if fresh
    if (cache && Date.now() - cache.ts < CACHE_TTL_MS) {
      return new Response(JSON.stringify(cache.data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const [fng, btcDom, dxy] = await Promise.allSettled([
      fetchFearGreed(),
      fetchBtcDominance(),
      fetchDxyProxy(),
    ]);

    const fearGreed = fng.status === "fulfilled" ? fng.value : null;
    const btcDominance = btcDom.status === "fulfilled" ? btcDom.value : null;
    const dollarIndex = dxy.status === "fulfilled" ? dxy.value : null;

    const snapshot = {
      fearGreed: fearGreed ?? cache?.data?.fearGreed ?? { value: 0, label: "Unavailable", source: "cache" },
      btcDominance: btcDominance ?? cache?.data?.btcDominance ?? { value: 0, source: "cache" },
      dollarIndex: dollarIndex ?? cache?.data?.dollarIndex ?? { value: 0, label: "Unavailable", source: "cache" },
      updatedAt: new Date().toISOString(),
      stale: !fearGreed || !btcDominance || !dollarIndex,
    };

    cache = { data: snapshot, ts: Date.now() };

    return new Response(JSON.stringify(snapshot), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
