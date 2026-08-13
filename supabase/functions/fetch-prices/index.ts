import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

const COIN_IDS = "solana,bitcoin,ethereum,jupiter-exchange-solana,bonk,raydium,pyth-network";
const SYMBOLS_MAP: Record<string, string> = {
  solana: "SOL",
  bitcoin: "BTC",
  ethereum: "ETH",
  "jupiter-exchange-solana": "JUP",
  bonk: "BONK",
  raydium: "RAY",
  "pyth-network": "PYTH",
};

const FALLBACK_TICKERS = [
  { symbol: "SOL", price: 83, change24h: 0 },
  { symbol: "BTC", price: 67000, change24h: 0 },
  { symbol: "ETH", price: 1960, change24h: 0 },
  { symbol: "JUP", price: 0.175, change24h: 0 },
  { symbol: "BONK", price: 0.0000059, change24h: 0 },
  { symbol: "RAY", price: 0.586, change24h: 0 },
  { symbol: "PYTH", price: 0.047, change24h: 0 },
];

let cachedTickers: any[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 120_000;

serve(async (req) => {
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
    const now = Date.now();
    if (cachedTickers && now - cacheTimestamp < CACHE_TTL_MS) {
      return new Response(JSON.stringify(cachedTickers), {
        headers: { ...cors.headers, "Content-Type": "application/json" },
      });
    }

    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${COIN_IDS}&vs_currencies=usd&include_24hr_change=true`;
    const res = await fetch(url);

    if (!res.ok) {
      console.error("CoinGecko error:", res.status);
      if (cachedTickers) {
        return new Response(JSON.stringify(cachedTickers), {
          headers: { ...cors.headers, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify(FALLBACK_TICKERS), {
        headers: { ...cors.headers, "Content-Type": "application/json" },
      });
    }

    const raw = await res.json();
    const tickers = Object.entries(raw).map(([id, data]: [string, any]) => ({
      symbol: SYMBOLS_MAP[id] || id.toUpperCase(),
      price: data.usd,
      change24h: data.usd_24h_change ?? 0,
    }));

    cachedTickers = tickers;
    cacheTimestamp = now;

    return new Response(JSON.stringify(tickers), {
      headers: { ...cors.headers, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("fetch-prices error:", e);
    if (cachedTickers) {
      return new Response(JSON.stringify(cachedTickers), {
        headers: { ...cors.headers, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify(FALLBACK_TICKERS), {
      headers: { ...cors.headers, "Content-Type": "application/json" },
    });
  }
});
