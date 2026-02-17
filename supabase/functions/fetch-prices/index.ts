import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${COIN_IDS}&vs_currencies=usd&include_24hr_change=true`;
    const res = await fetch(url);

    if (!res.ok) {
      console.error("CoinGecko error:", res.status);
      return new Response(JSON.stringify({ error: "Price feed unavailable" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const raw = await res.json();
    const tickers = Object.entries(raw).map(([id, data]: [string, any]) => ({
      symbol: SYMBOLS_MAP[id] || id.toUpperCase(),
      price: data.usd,
      change24h: data.usd_24h_change ?? 0,
    }));

    return new Response(JSON.stringify(tickers), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("fetch-prices error:", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
