// Proxy to the self-hosted agent backend (exposed via localtunnel).
// - Hides tunnel URL / password from the browser
// - Pipes upstream response body straight through (supports SSE streaming)
// - Upstash Redis rate limiting when configured; in-memory fallback otherwise
// - Distinguishes missing / expired / invalid JWTs when auth is required
// - Graceful abort: cancels upstream when client disconnects
// - Persists sanitized request metadata to proxy_request_log for admin replay
import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://tcdterminal.lovable.app",
  "https://id-preview--19dfb6f8-6d48-4348-b424-2070a2f80361.lovable.app",
  "https://19dfb6f8-6d48-4348-b424-2070a2f80361.lovableproject.com",
  "https://id-preview--19dfb6f8-6d48-4348-b424-2070a2f80361.lovableproject.com",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:8080",
];
const baseCorsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "x-request-id, x-auth-reason, x-rl-remaining",
  "Vary": "Origin",
};
function corsFor(req: Request) {
  const origin = req.headers.get("Origin");
  if (!origin) return { headers: baseCorsHeaders, allowed: true };
  if (ALLOWED_ORIGINS.includes(origin)) {
    return { headers: { ...baseCorsHeaders, "Access-Control-Allow-Origin": origin }, allowed: true };
  }
  return { headers: baseCorsHeaders, allowed: false };
}
// Track corsHeaders per-request; default is restrictive (no origin set).
let corsHeaders: Record<string, string> = baseCorsHeaders;

const BASE = (Deno.env.get("AGENT_BACKEND_URL") || "").replace(/\/+$/, "");
const TUNNEL_PW = Deno.env.get("AGENT_TUNNEL_PASSWORD") || "";
// SECURITY: auth is required by default; opt-out only via explicit env flag.
const REQUIRE_AUTH = (Deno.env.get("AGENT_REQUIRE_AUTH") || "1") !== "0";
const TIMEOUT_MS = Number(Deno.env.get("AGENT_TIMEOUT_MS") || 60_000);
const RATE_LIMIT = Number(Deno.env.get("AGENT_RATE_LIMIT") || 20);
const RATE_WINDOW_S = Math.ceil(Number(Deno.env.get("AGENT_RATE_WINDOW_MS") || 60_000) / 1000);
const UPSTASH_URL = (Deno.env.get("UPSTASH_REDIS_REST_URL") || "").replace(/\/+$/, "");
const UPSTASH_TOKEN = Deno.env.get("UPSTASH_REDIS_REST_TOKEN") || "";
const HAS_UPSTASH = !!(UPSTASH_URL && UPSTASH_TOKEN);

const jsonRes = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extra },
  });

// ---------- Rate limiting ----------
const buckets = new Map<string, { count: number; resetAt: number }>();
function memoryHit(key: string) {
  const now = Date.now();
  const winMs = RATE_WINDOW_S * 1000;
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + winMs });
    return { ok: true, remaining: RATE_LIMIT - 1, retryAfter: 0 };
  }
  if (b.count >= RATE_LIMIT) return { ok: false, remaining: 0, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  b.count += 1;
  return { ok: true, remaining: RATE_LIMIT - b.count, retryAfter: 0 };
}

async function upstashHit(key: string): Promise<{ ok: boolean; remaining: number; retryAfter: number; source: "upstash" | "memory" }> {
  try {
    // Atomic INCR + EXPIRE via Upstash pipeline
    const res = await fetch(`${UPSTASH_URL}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify([
        ["INCR", `rl:agent:${key}`],
        ["EXPIRE", `rl:agent:${key}`, String(RATE_WINDOW_S), "NX"],
        ["TTL", `rl:agent:${key}`],
      ]),
    });
    if (!res.ok) throw new Error(`upstash ${res.status}`);
    const out = await res.json(); // [{result:N},{result:0|1},{result:ttl}]
    const count = Number(out?.[0]?.result ?? 0);
    const ttl = Math.max(1, Number(out?.[2]?.result ?? RATE_WINDOW_S));
    if (count > RATE_LIMIT) return { ok: false, remaining: 0, retryAfter: ttl, source: "upstash" };
    return { ok: true, remaining: Math.max(0, RATE_LIMIT - count), retryAfter: 0, source: "upstash" };
  } catch (e) {
    console.log(JSON.stringify({ rlFallback: "memory", err: String(e) }));
    return { ...memoryHit(key), source: "memory" };
  }
}

async function rateHit(key: string) {
  if (HAS_UPSTASH) return await upstashHit(key);
  return { ...memoryHit(key), source: "memory" as const };
}

function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") || "";
  return fwd.split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "unknown";
}

// ---------- Auth ----------
async function checkAuth(req: Request): Promise<{ userId: string | null; reason: string }> {
  const h = req.headers.get("Authorization");
  if (!h?.startsWith("Bearer ")) return { userId: null, reason: "missing" };
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
    const token = h.replace("Bearer ", "");
    const { data, error } = await sb.auth.getClaims(token);
    if (error) {
      const msg = String(error.message || "").toLowerCase();
      return { userId: null, reason: msg.includes("expired") ? "expired" : "invalid" };
    }
    const claims: any = data?.claims;
    if (!claims?.sub) return { userId: null, reason: "invalid" };
    if (typeof claims.exp === "number" && claims.exp * 1000 < Date.now()) {
      return { userId: null, reason: "expired" };
    }
    return { userId: claims.sub as string, reason: "ok" };
  } catch {
    return { userId: null, reason: "invalid" };
  }
}

// ---------- Persistence ----------
const adminSb = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
function sanitizePayload(p: any) {
  if (!p || typeof p !== "object") return p;
  const clone: any = { ...p };
  for (const k of Object.keys(clone)) {
    const v = clone[k];
    if (typeof v === "string" && v.length > 2000) clone[k] = v.slice(0, 2000) + "…[truncated]";
  }
  return clone;
}
async function logRequest(row: {
  reqId: string; userId: string | null; path: string; payload: any;
  status: number; latencyMs: number; upstreamSnippet?: string | null; error?: string | null;
}) {
  try {
    await adminSb().from("proxy_request_log").insert({
      req_id: row.reqId,
      user_id: row.userId,
      path: row.path,
      payload: sanitizePayload(row.payload),
      status: row.status,
      latency_ms: row.latencyMs,
      upstream_snippet: row.upstreamSnippet?.slice(0, 2000) ?? null,
      error: row.error?.slice(0, 500) ?? null,
    });
  } catch (e) {
    console.log(JSON.stringify({ logInsertFailed: String(e) }));
  }
}

Deno.serve(async (req) => {
  const cors = corsFor(req);
  corsHeaders = cors.headers;
  if (req.method === "OPTIONS") {
    if (!cors.allowed) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
    return new Response(null, { headers: corsHeaders });
  }
  if (!cors.allowed) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
  if (req.method !== "POST") return jsonRes(405, { error: "Method not allowed" });
  if (!BASE) return jsonRes(500, { error: "AGENT_BACKEND_URL not set" });

  const reqId = crypto.randomUUID().slice(0, 8);
  const started = Date.now();

  const auth = await checkAuth(req);
  if (REQUIRE_AUTH && auth.reason !== "ok") {
    const messages: Record<string, string> = {
      missing: "Sign in to chat with the agent.",
      expired: "Your session has expired. Please sign in again.",
      invalid: "Invalid credentials. Please sign in again.",
    };
    console.log(JSON.stringify({ reqId, status: 401, authReason: auth.reason }));
    return jsonRes(401,
      { error: messages[auth.reason] || "Authentication required", reason: auth.reason, requestId: reqId },
      { "x-auth-reason": auth.reason, "x-request-id": reqId },
    );
  }

  const rlKey = auth.userId ?? clientKey(req);
  const rl = await rateHit(rlKey);
  if (!rl.ok) {
    console.log(JSON.stringify({ reqId, status: 429, source: rl.source, retryAfter: rl.retryAfter }));
    return jsonRes(429,
      { error: "Rate limit exceeded", retryAfter: rl.retryAfter, requestId: reqId },
      { "Retry-After": String(rl.retryAfter), "x-request-id": reqId, "x-rl-remaining": "0" },
    );
  }

  let body: any;
  try { body = await req.json(); } catch { return jsonRes(400, { error: "Invalid JSON" }); }
  const path = typeof body?.path === "string" && body.path.startsWith("/") ? body.path : "/api/chat";
  const wantStream = body?.stream !== false;
  const payload = body?.payload ?? {
    message: body?.message ?? "",
    session: body?.session ?? "lovable-main-session",
    mode: body?.mode ?? "agent",
    stream: wantStream,
  };
  // Internal replay flag — used by agent-proxy-replay; never trust from client without admin auth
  // (the replay function calls us with x-replay-admin-token = SUPABASE_SERVICE_ROLE_KEY)
  const replayToken = req.headers.get("x-replay-admin-token");
  const isReplay = !!(replayToken && replayToken === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort("timeout"), TIMEOUT_MS);
  // Graceful abort: when the client disconnects, abort upstream too
  const clientAbort = () => { try { ctrl.abort("client-disconnect"); } catch { /* noop */ } };
  req.signal.addEventListener("abort", clientAbort);

  try {
    const upstream = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: wantStream ? "text/event-stream, application/json" : "application/json",
        "bypass-tunnel-reminder": "1",
        "x-tunnel-password": TUNNEL_PW,
        "User-Agent": "tcd-terminal-edge/1.0",
      },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });

    const upstreamCT = upstream.headers.get("content-type") || "application/json";
    const isStream = upstreamCT.includes("text/event-stream") || upstreamCT.includes("application/x-ndjson");

    if (isStream && upstream.body) {
      clearTimeout(timer);
      console.log(JSON.stringify({
        reqId, path, status: upstream.status, mode: "stream",
        ttfbMs: Date.now() - started, rl: rl.source, rlRemaining: rl.remaining, replay: isReplay,
      }));
      // Fire-and-forget log row (stream length unknown until done; we record TTFB)
      logRequest({
        reqId, userId: auth.userId, path, payload,
        status: upstream.status, latencyMs: Date.now() - started,
        upstreamSnippet: "[stream]", error: null,
      });
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          ...corsHeaders,
          "Content-Type": upstreamCT,
          "Cache-Control": "no-cache, no-transform",
          "x-request-id": reqId,
          "x-rl-remaining": String(rl.remaining),
        },
      });
    }

    const text = await upstream.text();
    clearTimeout(timer);
    const latencyMs = Date.now() - started;
    console.log(JSON.stringify({
      reqId, path, status: upstream.status, mode: "buffered",
      latencyMs, bytes: text.length, rl: rl.source, rlRemaining: rl.remaining, replay: isReplay,
    }));
    logRequest({
      reqId, userId: auth.userId, path, payload,
      status: upstream.status, latencyMs,
      upstreamSnippet: text, error: upstream.ok ? null : `upstream ${upstream.status}`,
    });
    return new Response(text, {
      status: upstream.status,
      headers: {
        ...corsHeaders, "Content-Type": upstreamCT,
        "x-request-id": reqId, "x-rl-remaining": String(rl.remaining),
      },
    });
  } catch (e) {
    clearTimeout(timer);
    const reason = (e as any)?.name === "AbortError" || ctrl.signal.aborted
      ? (String(ctrl.signal.reason) === "client-disconnect" ? "client-disconnect" : "timeout")
      : "fetch-failed";
    const status = reason === "timeout" ? 504 : reason === "client-disconnect" ? 499 : 502;
    const latencyMs = Date.now() - started;
    console.log(JSON.stringify({ reqId, status, latencyMs, err: reason }));
    logRequest({
      reqId, userId: auth.userId, path, payload: body?.payload ?? body,
      status, latencyMs, upstreamSnippet: null, error: `${reason}: ${String(e).slice(0, 200)}`,
    });
    // Client disconnects don't get a response — but return one anyway in case the runtime still listens
    return jsonRes(status,
      {
        error: reason === "timeout" ? "Upstream timeout"
          : reason === "client-disconnect" ? "Client disconnected"
          : "Upstream fetch failed",
        requestId: reqId,
      },
      { "x-request-id": reqId, "x-rl-remaining": String(rl.remaining) },
    );
  } finally {
    req.signal.removeEventListener("abort", clientAbort);
  }
});
