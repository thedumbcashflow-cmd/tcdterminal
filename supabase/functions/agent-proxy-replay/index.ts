// Admin-only debug endpoint: given a reqId, replay the original sanitized
// payload against the tunnel backend via agent-proxy and return upstream
// response + log row. Never exposes secrets, raw IPs, or tunnel headers.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(url, anon);
  const { data: claims, error: authErr } = await sb.auth.getClaims(authHeader.replace("Bearer ", ""));
  const uid = (claims as any)?.claims?.sub;
  if (authErr || !uid) return json(401, { error: "Unauthorized" });

  const admin = createClient(url, service);
  const { data: roleRow } = await admin.from("user_roles").select("role").eq("user_id", uid).eq("role", "admin").maybeSingle();
  if (!roleRow) return json(403, { error: "Admin role required" });

  let body: any;
  try { body = await req.json(); } catch { return json(400, { error: "Invalid JSON" }); }
  const reqId = String(body?.reqId || "").trim();
  if (!reqId || reqId.length > 64) return json(400, { error: "reqId required" });

  const { data: rows, error: qErr } = await admin
    .from("proxy_request_log")
    .select("*")
    .eq("req_id", reqId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (qErr) return json(500, { error: qErr.message });
  if (!rows?.length) return json(404, { error: "reqId not found", reqId });
  const original = rows[0];

  // Replay via agent-proxy with internal admin token; force non-stream for simple capture
  const proxyUrl = `${url}/functions/v1/agent-proxy`;
  const t0 = Date.now();
  let replayStatus = 0;
  let replayBody = "";
  let replayErr: string | null = null;
  try {
    const r = await fetch(proxyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${service}`,
        apikey: anon,
        "x-replay-admin-token": service,
      },
      body: JSON.stringify({
        path: original.path || "/api/chat",
        stream: false,
        payload: { ...(original.payload ?? {}), stream: false },
      }),
    });
    replayStatus = r.status;
    replayBody = (await r.text()).slice(0, 4000);
  } catch (e) {
    replayErr = String(e).slice(0, 300);
  }

  return json(200, {
    original: {
      reqId: original.req_id,
      path: original.path,
      status: original.status,
      latencyMs: original.latency_ms,
      createdAt: original.created_at,
      payload: original.payload,
      upstreamSnippet: original.upstream_snippet,
      error: original.error,
    },
    replay: {
      status: replayStatus,
      latencyMs: Date.now() - t0,
      body: replayBody,
      error: replayErr,
    },
  });
});
