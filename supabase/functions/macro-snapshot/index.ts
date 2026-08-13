import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://tcdterminal.lovable.app",
  "https://id-preview--19dfb6f8-6d48-4348-b424-2070a2f80361.lovable.app",
  "https://19dfb6f8-6d48-4348-b424-2070a2f80361.lovableproject.com",
  "https://id-preview--19dfb6f8-6d48-4348-b424-2070a2f80361.lovableproject.com",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:8080",
];

const baseCors = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Vary": "Origin",
};

function corsFor(req: Request) {
  const origin = req.headers.get("Origin");
  if (!origin) return { headers: baseCors, allowed: true, origin: null as string | null };
  if (ALLOWED_ORIGINS.includes(origin)) {
    return { headers: { ...baseCors, "Access-Control-Allow-Origin": origin }, allowed: true, origin };
  }
  return { headers: baseCors, allowed: false, origin };
}

function logCorsDenied(req: Request, origin: string | null) {
  const url = new URL(req.url);
  console.error(JSON.stringify({
    event: "cors_denied",
    origin,
    path: url.pathname,
    timestamp: new Date().toISOString(),
    ip: req.headers.get("x-forwarded-for") ?? "unknown",
  }));
}

let cache: { data: any; ts: number } | null = null;
const CACHE_TTL_MS = 60_000;

async function fetchFearGreed() {
  try {
    const res = await fetch("https://api.alternative.me/fng/?limit=30", { signal: AbortSignal.timeout(5000) });
    const json = await res.json();
    const arr = Array.isArray(json?.data) ? json.data : [];
    const d = arr[0];
    const history = arr.slice().reverse().map((row: any) => ({
      t: Number(row?.timestamp) * 1000,
      v: Number(row?.value ?? 0),
    }));
    return {
      value: Number(d?.value ?? 0),
      label: d?.value_classification ?? "Unknown",
      source: "alternative.me",
      history,
    };
  } catch {
    return null;
  }
}

async function fetchBtcDominance() {
  try {
    const res = await fetch("https://api.coinpaprika.com/v1/global", { signal: AbortSignal.timeout(3000) });
    const json = await res.json();
    const value = Number((json?.bitcoin_dominance_percentage ?? 0).toFixed(2));
    // Build 30d history from CoinGecko global market data fallback (approx via current ± synthetic spread is avoided).
    // Use coinpaprika historical: requires PRO. So we approximate with a flat history seeded by current value.
    let history: { t: number; v: number }[] = [];
    try {
      const histRes = await fetch(
        "https://api.coingecko.com/api/v3/global/market_cap_chart?days=30",
        { signal: AbortSignal.timeout(5000) },
      );
      if (histRes.ok) {
        const hj = await histRes.json();
        const btc = hj?.market_cap_chart?.market_cap ?? [];
        const total = hj?.market_cap_chart?.market_cap ?? [];
        // CoinGecko free tier doesn't always expose per-asset breakdown; fall back gracefully.
        if (Array.isArray(btc) && btc.length && Array.isArray(total) && total.length) {
          history = btc.map((p: [number, number], i: number) => ({
            t: p[0],
            v: total[i] ? Number(((p[1] / total[i]) * 100).toFixed(2)) : value,
          }));
        }
      }
    } catch { /* swallow */ }
    if (!history.length) {
      // Synthesize a stable flatline anchored at the live value for the sparkline.
      const now = Date.now();
      history = Array.from({ length: 30 }, (_, i) => ({
        t: now - (29 - i) * 86400000,
        v: value,
      }));
    }
    return { value, source: "coinpaprika", history };
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
    const dxyApprox = Number(((1 / eurRate) * 108).toFixed(2));
    // Build 30d EUR/USD history → DXY proxy via Frankfurter (ECB, free, no key).
    let history: { t: number; v: number }[] = [];
    try {
      const end = new Date();
      const start = new Date(end.getTime() - 30 * 86400000);
      const fmt = (d: Date) => d.toISOString().slice(0, 10);
      const fxRes = await fetch(
        `https://api.frankfurter.app/${fmt(start)}..${fmt(end)}?from=USD&to=EUR`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (fxRes.ok) {
        const fj = await fxRes.json();
        const rates = fj?.rates ?? {};
        history = Object.entries(rates)
          .map(([date, obj]: [string, any]) => ({
            t: new Date(date).getTime(),
            v: Number((((1 / Number(obj?.EUR ?? 0)) * 108)).toFixed(2)),
          }))
          .filter((p) => isFinite(p.v) && p.v > 0)
          .sort((a, b) => a.t - b.t);
      }
    } catch { /* swallow */ }
    if (!history.length) {
      const now = Date.now();
      history = Array.from({ length: 30 }, (_, i) => ({
        t: now - (29 - i) * 86400000,
        v: dxyApprox,
      }));
    }
    return { value: dxyApprox, label: "USD Index (proxy)", source: "er-api.com + frankfurter", history };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  const cors = corsFor(req);
  if (req.method === "OPTIONS") {
    if (!cors.allowed) {
      logCorsDenied(req, cors.origin);
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(null, { headers: cors.headers });
  }
  if (!cors.allowed) {
    logCorsDenied(req, cors.origin);
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { "Content-Type": "application/json" },
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
