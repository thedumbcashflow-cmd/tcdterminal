// Solscan Pro API v2 proxy — routes whitelisted endpoints, applies tier gating,
// caches in memory to respect rate limits. Auth required (JWT validated in code).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SOLSCAN_BASE = "https://pro-api.solscan.io/v2.0";

// Whitelist of endpoints we expose. Free/trial users get meta+market only.
type EndpointDef = { path: string; premium: boolean; ttl: number };
const ENDPOINTS: Record<string, EndpointDef> = {
  meta:           { path: "/token/meta",                premium: false, ttl: 300 },
  markets:        { path: "/token/markets",             premium: false, ttl: 60 },
  price:          { path: "/token/price",               premium: false, ttl: 60 },
  holders:        { path: "/token/holders",             premium: true,  ttl: 120 },
  transfers:      { path: "/token/transfer",            premium: true,  ttl: 30 },
  defi:           { path: "/token/defi/activities",     premium: true,  ttl: 30 },
  trending:       { path: "/token/trending",            premium: false, ttl: 120 },
  "holders-change": { path: "/token/holders/change",    premium: true,  ttl: 180 },
  "top-holders":    { path: "/token/top_holders",       premium: true,  ttl: 180 },
  "dex-trades":     { path: "/token/dex/trades",        premium: true,  ttl: 30 },
  "wallet-pnl":     { path: "/account/portfolio/pnl",   premium: true,  ttl: 120 },
};

const cache = new Map<string, { at: number; body: unknown }>();

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const SOLSCAN_API_KEY = Deno.env.get("SOLSCAN_API_KEY");
  if (!SOLSCAN_API_KEY) return json(500, { error: "SOLSCAN_API_KEY not configured" });

  // Auth + tier check
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) return json(401, { error: "Invalid session" });

  let body: { endpoint?: string; params?: Record<string, string | number> };
  try { body = await req.json(); } catch { return json(400, { error: "Invalid JSON" }); }

  const def = body.endpoint ? ENDPOINTS[body.endpoint] : undefined;
  if (!def) return json(400, { error: "Unknown endpoint" });

  if (def.premium) {
    const { data: profile } = await supabase
      .from("profiles").select("subscription_tier").eq("id", userData.user.id).maybeSingle();
    const tier = profile?.subscription_tier as string | undefined;
    const isPaid = tier === "pro" || tier === "whale" || tier === "trial";
    if (!isPaid) return json(403, { error: "Premium tier required", code: "tier_required" });
  }

  // Build URL
  const url = new URL(SOLSCAN_BASE + def.path);
  for (const [k, v] of Object.entries(body.params || {})) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  const cacheKey = url.toString();

  const cached = cache.get(cacheKey);
  if (cached && (Date.now() - cached.at) / 1000 < def.ttl) {
    return json(200, { data: cached.body, cached: true });
  }

  try {
    const resp = await fetch(url.toString(), {
      headers: { token: SOLSCAN_API_KEY, accept: "application/json" },
    });
    const text = await resp.text();
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }

    if (!resp.ok) {
      console.error("Solscan error", resp.status, text.slice(0, 500));
      return json(resp.status, { error: "Solscan upstream error", status: resp.status, detail: parsed });
    }

    cache.set(cacheKey, { at: Date.now(), body: parsed });
    return json(200, { data: parsed, cached: false });
  } catch (e) {
    console.error("solscan-proxy fetch failed", e);
    return json(502, { error: "Upstream fetch failed", detail: String(e) });
  }
});
