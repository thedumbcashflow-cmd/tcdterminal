// Proxy to the self-hosted agent backend (exposed via localtunnel).
// Hides the tunnel URL/password from the browser and centralizes CORS.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BASE = (Deno.env.get("AGENT_BACKEND_URL") || "").replace(/\/+$/, "");
const TUNNEL_PW = Deno.env.get("AGENT_TUNNEL_PASSWORD") || "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!BASE) {
    return new Response(JSON.stringify({ error: "AGENT_BACKEND_URL not set" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: any;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Allow overriding the agent path (default /api/chat)
  const path = typeof body?.path === "string" && body.path.startsWith("/") ? body.path : "/api/chat";
  const payload = body?.payload ?? {
    message: body?.message ?? "",
    session: body?.session ?? "lovable-main-session",
    mode: body?.mode ?? "agent",
  };

  try {
    const upstream = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // localtunnel bypass for the IP-password warning page
        "bypass-tunnel-reminder": "1",
        "x-tunnel-password": TUNNEL_PW,
        "User-Agent": "tcd-terminal-edge/1.0",
      },
      body: JSON.stringify(payload),
    });

    const text = await upstream.text();
    const ct = upstream.headers.get("content-type") || "application/json";
    return new Response(text, {
      status: upstream.status,
      headers: { ...corsHeaders, "Content-Type": ct },
    });
  } catch (e) {
    console.error("agent-proxy upstream error", e);
    return new Response(JSON.stringify({ error: "Upstream fetch failed", detail: String(e) }), {
      status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
