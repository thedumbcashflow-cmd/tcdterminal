// Public Solana RPC methods proxied server-side.
// - Allow-list of methods (prevents abuse of a shared Helius key).
// - Multi-endpoint fallback: Helius → publicnode → mainnet-beta.
// - Per-endpoint retry with exponential backoff (100/300/900ms) on 5xx/timeout.
// - Per-endpoint circuit breaker: 5 consecutive failures in 60s trips it
//   OPEN for 30s so we stop hammering a dead node.
// - 15s in-memory response cache.
const ALLOWED_ORIGINS = [
  "https://tcdterminal.lovable.app",
  "https://id-preview--19dfb6f8-6d48-4348-b424-2070a2f80361.lovable.app",
  "https://19dfb6f8-6d48-4348-b424-2070a2f80361.lovableproject.com",
  "https://id-preview--19dfb6f8-6d48-4348-b424-2070a2f80361.lovableproject.com",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:8080",
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

export const ALLOWED_METHODS = new Set([
  "getEpochInfo",
  "getVoteAccounts",
  "getRecentPerformanceSamples",
  "getSlot",
  "getHealth",
  "getBlockHeight",
]);

const HELIUS_KEY = Deno.env.get("HELIUS_API_KEY") || "";
const ENDPOINTS: { name: string; url: string }[] = [
  ...(HELIUS_KEY ? [{ name: "helius", url: `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}` }] : []),
  { name: "publicnode",   url: "https://solana-rpc.publicnode.com" },
  { name: "mainnet-beta", url: "https://api.mainnet-beta.solana.com" },
];

// ── Circuit breaker state ──
interface Breaker { fails: number; firstFailAt: number; openUntil: number; }
const breakers = new Map<string, Breaker>();
const CB_FAILS_THRESHOLD = 5;
const CB_WINDOW_MS = 60_000;
const CB_OPEN_MS   = 30_000;

function isOpen(name: string, now = Date.now()): boolean {
  const b = breakers.get(name);
  return !!(b && b.openUntil > now);
}
function recordFailure(name: string, now = Date.now()) {
  const b = breakers.get(name) ?? { fails: 0, firstFailAt: now, openUntil: 0 };
  if (now - b.firstFailAt > CB_WINDOW_MS) { b.fails = 0; b.firstFailAt = now; }
  b.fails++;
  if (b.fails >= CB_FAILS_THRESHOLD) {
    b.openUntil = now + CB_OPEN_MS;
    b.fails = 0;
    b.firstFailAt = now;
  }
  breakers.set(name, b);
}
function recordSuccess(name: string) {
  const b = breakers.get(name);
  if (b) { b.fails = 0; b.openUntil = 0; }
}

// exported for tests
export function _resetBreakers() { breakers.clear(); }
export function _breakerState(name: string) { return breakers.get(name); }

// ── Cache ──
const cache = new Map<string, { at: number; body: unknown }>();
const TTL_MS = 15_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callOnce(url: string, method: string, params: unknown[], timeoutMs = 4000) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: ctrl.signal,
    });
    const status = r.status;
    const j = await r.json().catch(() => ({}));
    return { status, body: j };
  } finally {
    clearTimeout(to);
  }
}

async function callWithBackoff(endpoint: { name: string; url: string }, method: string, params: unknown[]) {
  const delays = [100, 300, 900];
  let lastErr: unknown = null;
  for (let i = 0; i < delays.length; i++) {
    try {
      const { status, body } = await callOnce(endpoint.url, method, params);
      if (status >= 500) { lastErr = new Error(`${endpoint.name} HTTP ${status}`); }
      else if (body?.error) { lastErr = new Error(`${endpoint.name}: ${body.error.message}`); }
      else if (status >= 200 && status < 300 && "result" in body) {
        return { ok: true as const, result: body.result };
      } else {
        lastErr = new Error(`${endpoint.name} HTTP ${status}`);
      }
    } catch (e) {
      lastErr = e;
    }
    if (i < delays.length - 1) await sleep(delays[i]);
  }
  return { ok: false as const, error: lastErr };
}

export async function callWithFallback(method: string, params: unknown[]) {
  const errors: string[] = [];
  for (const ep of ENDPOINTS) {
    if (isOpen(ep.name)) { errors.push(`${ep.name}: circuit-open`); continue; }
    const r = await callWithBackoff(ep, method, params);
    if (r.ok) { recordSuccess(ep.name); return { result: r.result, endpoint: ep.name }; }
    recordFailure(ep.name);
    errors.push((r.error as Error)?.message ?? String(r.error));
  }
  throw new Error(`all endpoints failed: ${errors.join(" | ")}`);
}

export async function handleRequest(req: Request): Promise<Response> {
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
    const { result, endpoint } = await callWithFallback(method, params);
    cache.set(cacheKey, { at: Date.now(), body: result });
    return new Response(JSON.stringify({ result, endpoint }), { headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), { status: 502, headers });
  }
}

// Serve is registered by index.ts to keep this module import-safe for tests.
