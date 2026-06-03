// Proxy to the self-hosted agent backend (exposed via localtunnel).
// - Hides tunnel URL / password from the browser
// - Lightweight per-IP rate limiting (no PII / no headers logged)
// - Optional Lovable Cloud auth gate via REQUIRE_AUTH=1
// - Bounded timeout + structured logs (reqId, status, latencyMs)
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BASE = (Deno.env.get("AGENT_BACKEND_URL") || "").replace(/\/+$/, "");
const TUNNEL_PW = Deno.env.get("AGENT_TUNNEL_PASSWORD") || "";
const REQUIRE_AUTH = (Deno.env.get("AGENT_REQUIRE_AUTH") || "0") === "1";
const TIMEOUT_MS = Number(Deno.env.get("AGENT_TIMEOUT_MS") || 25_000);
const RATE_LIMIT = Number(Deno.env.get("AGENT_RATE_LIMIT") || 20); // requests
const RATE_WINDOW_MS = Number(Deno.env.get("AGENT_RATE_WINDOW_MS") || 60_000);

const j = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// In-memory rate buckets (per warm instance). Best-effort, not strict.
const buckets = new Map<string, { count: number; resetAt: number }>();
function rateHit(key: string) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { ok: true, remaining: RATE_LIMIT - 1, retryAfter: 0 };
  }
  if (b.count >= RATE_LIMIT) {
    return { ok: false, remaining: 0, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  }
  b.count += 1;
  return { ok: true, remaining: RATE_LIMIT - b.count, retryAfter: 0 };
}

function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") || "";
  const ip = fwd.split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "unknown";
  return ip;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return j(405, { error: "Method not allowed" });
  if (!BASE) return j(500, { error: "AGENT_BACKEND_URL not set" });

  const reqId = crypto.randomUUID().slice(0, 8);
  const started = Date.now();

  // --- Optional auth gate ---
  let userId: string | null = null;
  const authHeader = req.headers.get("Authorization");
  if (REQUIRE_AUTH) {
    if (!authHeader?.startsWith("Bearer ")) {
      console.log(JSON.stringify({ reqId, status: 401, reason: "missing_auth" }));
      return j(401, { error: "Authentication required" });
    }
    try {
      const sb = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
      );
      const { data, error } = await sb.auth.getClaims(authHeader.replace("Bearer ", ""));
      if (error || !data?.claims?.sub) {
        console.log(JSON.stringify({ reqId, status: 401, reason: "invalid_token" }));
        return j(401, { error: "Invalid token" });
      }
      userId = data.claims.sub as string;
    } catch (e) {
      console.log(JSON.stringify({ reqId, status: 401, reason: "auth_error", err: String(e) }));
      return j(401, { error: "Authentication failed" });
    }
  }

  // --- Rate limit (per user if authed, else per IP) ---
  const rlKey = userId ?? clientKey(req);
  const rl = rateHit(rlKey);
  if (!rl.ok) {
    console.log(JSON.stringify({ reqId, status: 429, key: rlKey.slice(0, 6), retryAfter: rl.retryAfter }));
    return new Response(JSON.stringify({ error: "Rate limit exceeded", retryAfter: rl.retryAfter }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(rl.retryAfter) },
    });
  }

  // --- Parse body ---
  let body: any;
  try { body = await req.json(); } catch { return j(400, { error: "Invalid JSON" }); }
  const path = typeof body?.path === "string" && body.path.startsWith("/") ? body.path : "/api/chat";
  const payload = body?.payload ?? {
    message: body?.message ?? "",
    session: body?.session ?? "lovable-main-session",
    mode: body?.mode ?? "agent",
  };

  // --- Upstream call with timeout ---
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const upstream = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "bypass-tunnel-reminder": "1",
        "x-tunnel-password": TUNNEL_PW,
        "User-Agent": "tcd-terminal-edge/1.0",
      },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    const text = await upstream.text();
    const latencyMs = Date.now() - started;
    console.log(JSON.stringify({
      reqId, path, status: upstream.status, latencyMs,
      bytes: text.length, userId: userId ? "yes" : "no", rlRemaining: rl.remaining,
    }));

    return new Response(text, {
      status: upstream.status,
      headers: {
        ...corsHeaders,
        "Content-Type": upstream.headers.get("content-type") || "application/json",
        "x-request-id": reqId,
      },
    });
  } catch (e) {
    clearTimeout(timer);
    const aborted = (e as any)?.name === "AbortError";
    const latencyMs = Date.now() - started;
    console.log(JSON.stringify({ reqId, status: aborted ? 504 : 502, latencyMs, err: aborted ? "timeout" : String(e) }));
    return new Response(
      JSON.stringify({ error: aborted ? "Upstream timeout" : "Upstream fetch failed", requestId: reqId }),
      { status: aborted ? 504 : 502, headers: { ...corsHeaders, "Content-Type": "application/json", "x-request-id": reqId } },
    );
  }
});
