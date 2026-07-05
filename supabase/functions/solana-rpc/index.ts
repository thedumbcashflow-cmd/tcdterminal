// Public Solana RPC methods proxied server-side via Helius so the browser
// never gets 403/CORS'd by mainnet-beta and the Helius key stays private.
// Method allowlist prevents abuse.
const ALLOWED_ORIGINS = [
  "https://tcdterminal.lovable.app",
  "https://id-preview--19dfb6f8-6d48-4348-b424-2070a2f80361.lovable.app",
  "https://19dfb6f8-6d48-4348-b424-2070a2f80361.lovableproject.com",
  "https://id-preview--19dfb6f8-6d48-4348-b424-2070a2f80361.lovableproject.com",
  "http://localhost:3000",
  "http://localhost:5173",
];
const baseCors: Record<string, string> = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

const ALLOWED_METHODS = new Set([
  "getEpochInfo",
  "getVoteAccounts",
  "getRecentPerformanceSamples",
  "getSlot",
  "getHealth",
  "getBlockHeight",
]);

const HELIUS_KEY = Deno.env.get("HELIUS_API_KEY") || "";
const RPC_URL = HELIUS_KEY
  ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`
  : "https://solana-rpc.publicnode.com";

// In-memory cache to shield rate limits
const cache = new Map<string, { at: number; body: unknown }>();
const TTL_MS = 15_000;

Deno.serve(async (req) => {
  const cors = corsFor(req);
  const headers = { ...cors.headers, "Content-Type": "application/json" };
  if (req.method === "OPTIONS") {
    if (!cors.allowed) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers });
    return new Response(null, { headers: cors.headers });
  }
  if (!cors.allowed) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });

  let body: { method?: string; params?: unknown[] };
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers }); }
  const method = body.method || "";
  const params = Array.isArray(body.params) ? body.params : [];
  if (!ALLOWED_METHODS.has(method)) {
    return new Response(JSON.stringify({ error: `Method not allowed: ${method}` }), { status: 400, headers });
  }

  const cacheKey = `${method}:${JSON.stringify(params)}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return new Response(JSON.stringify({ result: hit.body, cached: true }), { headers });
  }

  try {
    const r = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const j = await r.json();
    if (j.error) return new Response(JSON.stringify({ error: j.error.message }), { status: 502, headers });
    cache.set(cacheKey, { at: Date.now(), body: j.result });
    return new Response(JSON.stringify({ result: j.result }), { headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 502, headers });
  }
});
