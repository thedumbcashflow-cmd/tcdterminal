// Proxy to the self-hosted agent backend (exposed via localtunnel).
// - Hides tunnel URL / password from the browser
// - Pipes upstream response body straight through (supports SSE streaming)
// - Lightweight per-IP/per-user rate limiting (in-memory, best-effort)
// - Distinguishes missing / expired / invalid JWTs when auth is required
// - Bounded timeout + structured logs (reqId, status, latencyMs)
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "x-request-id, x-auth-reason",
};

const BASE = (Deno.env.get("AGENT_BACKEND_URL") || "").replace(/\/+$/, "");
const TUNNEL_PW = Deno.env.get("AGENT_TUNNEL_PASSWORD") || "";
const REQUIRE_AUTH = (Deno.env.get("AGENT_REQUIRE_AUTH") || "0") === "1";
const TIMEOUT_MS = Number(Deno.env.get("AGENT_TIMEOUT_MS") || 60_000);
const RATE_LIMIT = Number(Deno.env.get("AGENT_RATE_LIMIT") || 20);
const RATE_WINDOW_MS = Number(Deno.env.get("AGENT_RATE_WINDOW_MS") || 60_000);

const jsonRes = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extra },
  });

const buckets = new Map<string, { count: number; resetAt: number }>();
function rateHit(key: string) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { ok: true, remaining: RATE_LIMIT - 1, retryAfter: 0 };
  }
  if (b.count >= RATE_LIMIT) return { ok: false, remaining: 0, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  b.count += 1;
  return { ok: true, remaining: RATE_LIMIT - b.count, retryAfter: 0 };
}

function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") || "";
  return fwd.split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "unknown";
}

// Returns { userId, reason } — reason is one of: ok | missing | expired | invalid
async function checkAuth(req: Request): Promise<{ userId: string | null; reason: string }> {
  const h = req.headers.get("Authorization");
  if (!h?.startsWith("Bearer ")) return { userId: null, reason: "missing" };
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
    const token = h.replace("Bearer ", "");
    const { data, error } = await sb.auth.getClaims(token);
    if (error) {
      const msg = String(error.message || "").toLowerCase();
      const reason = msg.includes("expired") ? "expired" : "invalid";
      return { userId: null, reason };
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonRes(405, { error: "Method not allowed" });
  if (!BASE) return jsonRes(500, { error: "AGENT_BACKEND_URL not set" });

  const reqId = crypto.randomUUID().slice(0, 8);
  const started = Date.now();

  // Always inspect auth so we can label per-user metrics even when REQUIRE_AUTH=0
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
  const rl = rateHit(rlKey);
  if (!rl.ok) {
    console.log(JSON.stringify({ reqId, status: 429, key: rlKey.slice(0, 6), retryAfter: rl.retryAfter }));
    return jsonRes(429,
      { error: "Rate limit exceeded", retryAfter: rl.retryAfter, requestId: reqId },
      { "Retry-After": String(rl.retryAfter), "x-request-id": reqId },
    );
  }

  let body: any;
  try { body = await req.json(); } catch { return jsonRes(400, { error: "Invalid JSON" }); }
  const path = typeof body?.path === "string" && body.path.startsWith("/") ? body.path : "/api/chat";
  const wantStream = body?.stream !== false; // default to streaming
  const payload = body?.payload ?? {
    message: body?.message ?? "",
    session: body?.session ?? "lovable-main-session",
    mode: body?.mode ?? "agent",
    stream: wantStream,
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
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

    // Stream pass-through: don't buffer, pipe the body straight to the client.
    if (isStream && upstream.body) {
      console.log(JSON.stringify({
        reqId, path, status: upstream.status, mode: "stream",
        authReason: auth.reason, userId: auth.userId ? "yes" : "no",
        ttfbMs: Date.now() - started, rlRemaining: rl.remaining,
      }));
      // Clear timer once headers received; stream may legitimately last > TIMEOUT_MS
      clearTimeout(timer);
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          ...corsHeaders,
          "Content-Type": upstreamCT,
          "Cache-Control": "no-cache, no-transform",
          "x-request-id": reqId,
        },
      });
    }

    // Buffered JSON path
    const text = await upstream.text();
    clearTimeout(timer);
    console.log(JSON.stringify({
      reqId, path, status: upstream.status, mode: "buffered",
      latencyMs: Date.now() - started, bytes: text.length,
      authReason: auth.reason, userId: auth.userId ? "yes" : "no", rlRemaining: rl.remaining,
    }));
    return new Response(text, {
      status: upstream.status,
      headers: { ...corsHeaders, "Content-Type": upstreamCT, "x-request-id": reqId },
    });
  } catch (e) {
    clearTimeout(timer);
    const aborted = (e as any)?.name === "AbortError";
    console.log(JSON.stringify({
      reqId, status: aborted ? 504 : 502,
      latencyMs: Date.now() - started, err: aborted ? "timeout" : String(e),
    }));
    return jsonRes(aborted ? 504 : 502,
      { error: aborted ? "Upstream timeout" : "Upstream fetch failed", requestId: reqId },
      { "x-request-id": reqId },
    );
  }
});
