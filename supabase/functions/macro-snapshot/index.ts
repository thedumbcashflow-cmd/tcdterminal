import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://tcdterminal.lovable.app",
  "https://id-preview--19dfb6f8-6d48-4348-b424-2070a2f80361.lovable.app",
  "http://localhost:3000",
  "http://localhost:5173",
];

const baseCors = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Vary": "Origin",
};

function corsFor(req: Request) {
  const origin = req.headers.get("Origin");
  if (!origin) return { headers: baseCors, allowed: true };
  if (ALLOWED_ORIGINS.includes(origin)) {
    return { headers: { ...baseCors, "Access-Control-Allow-Origin": origin }, allowed: true };
  }
  return { headers: baseCors, allowed: false };
}

let cache: { data: any; ts: number } | null = null;
const CACHE_TTL_MS = 60_000;

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
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", { signal: AbortSignal.timeout(3000) });
    const json = await res.json();
    const eurRate = json?.rates?.EUR;
    if (!eurRate) return null;
    const dxyApprox = (1 / eurRate) * 108;
    return { value: Number(dxyApprox.toFixed(1)), label: "USD Index (proxy)", source: "er-api.com" };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  const cors = corsFor(req);
  if (req.method === "OPTIONS") {
    if (!cors.allowed) return new Response("Forbidden", { status: 403 });
    return new Response(null, { headers: cors.headers });
  }
  if (!cors.allowed) {
    return new Response(JSON.stringify({ error: "Origin not allowed" }), {
      status: 403, headers: { ...cors.headers, "Content-Type": "application/json" },
    });
  }

  try {
    if (cache && Date.now() - cache.ts < CACHE_TTL_MS) {
      return new Response(JSON.stringify(cache.data), { headers: { ...cors.headers, "Content-Type": "application/json" } });
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
      headers: { ...cors.headers, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...cors.headers, "Content-Type": "application/json" },
    });
  }
});
