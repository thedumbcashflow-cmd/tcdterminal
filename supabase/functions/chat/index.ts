import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://tcdterminal.lovable.app",
  "https://id-preview--19dfb6f8-6d48-4348-b424-2070a2f80361.lovable.app",
  "http://localhost:3000",
  "http://localhost:5173",
];

const baseCors = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Vary": "Origin",
};

function corsFor(req: Request): { headers: Record<string, string>; allowed: boolean; origin: string | null } {
  const origin = req.headers.get("Origin");
  if (!origin) return { headers: baseCors, allowed: true, origin: null };
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

serve(async (req) => {
  const cors = corsFor(req);

  try {
    if (req.method === "OPTIONS") {
      if (!cors.allowed) {
        logCorsDenied(req, cors.origin);
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("ok", { headers: cors.headers });
    }
    if (!cors.allowed) {
      logCorsDenied(req, cors.origin);
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { ...cors.headers, "Content-Type": "application/json" },
      });

    const url = new URL(req.url);
    if (req.method === "GET" && url.pathname.endsWith("/health")) {
      return json({ status: "ok" });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const missing: string[] = [];
    if (!supabaseUrl) missing.push("SUPABASE_URL");
    if (!supabaseAnonKey) missing.push("SUPABASE_ANON_KEY");
    if (!supabaseServiceKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
    if (!LOVABLE_API_KEY) missing.push("LOVABLE_API_KEY");
    if (missing.length) {
      console.error("chat: missing env vars", missing);
      return json({ error: `Server misconfigured: missing ${missing.join(", ")}` }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseAuth = createClient(supabaseUrl!, supabaseAnonKey!, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) return json({ error: "Unauthorized" }, 401);

    const userId = claimsData.claims.sub;

    let body: { messages?: Array<{ role: string; content: string }> };
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (messages.length === 0 || messages.length > 50) {
      return json({ error: "messages must be a non-empty array of <=50 items" }, 400);
    }
    for (const m of messages) {
      if (typeof m?.content !== "string" || m.content.length > 4000) {
        return json({ error: "Each message.content must be a string <=4000 chars" }, 400);
      }
    }

    const supabase = createClient(supabaseUrl!, supabaseServiceKey!);
    const { data: profile } = await supabase
      .from("profiles").select("subscription_tier").eq("id", userId).maybeSingle();
    const isPaid = profile?.subscription_tier === "pro" || profile?.subscription_tier === "whale";

    let whaleQuery = supabase.from("market_intel").select("*").eq("intel_type", "whale_flow")
      .order("created_at", { ascending: false }).limit(20);
    if (!isPaid) whaleQuery = whaleQuery.eq("is_premium", false);
    const { data: whaleFlows } = await whaleQuery;

    let liqQuery = supabase.from("market_intel").select("*").eq("intel_type", "liquidation")
      .order("created_at", { ascending: false }).limit(20);
    if (!isPaid) liqQuery = liqQuery.eq("is_premium", false);
    const { data: liquidations } = await liqQuery;

    const whaleContext = whaleFlows?.length
      ? whaleFlows.map(w => `${w.asset_symbol}: $${w.value_usd?.toLocaleString()} ${w.flow_type} by ${w.wallet_label} (score: ${w.whale_flow_score})`).join("\n")
      : "No whale flow data available.";
    const liqContext = liquidations?.length
      ? liquidations.map(l => `${l.asset_symbol}: liquidation level $${l.liquidation_level} ($${l.value_usd?.toLocaleString()})`).join("\n")
      : "No liquidation data available.";

    const systemPrompt = `You are TCD Terminal AI — a concise, data-driven crypto intelligence assistant for the Solana ecosystem.
You speak in a professional, terminal-style tone. Keep answers short (2-4 sentences max unless asked for detail).

AVAILABLE DATA CONTEXT:
--- Whale Flows (last 20 events) ---
${whaleContext}

--- Liquidations (last 20 events) ---
${liqContext}

--- Network Health ---
Active Validators: ~1,847 | TPS: ~3,847 | Stake Rate: 67.3% | Epoch: 612

RULES:
- Always cite which dataset you're using (e.g., "Based on Whale Flow data…")
- If asked about something outside crypto/Solana, politely redirect: "TCD Terminal covers Solana crypto intelligence. I can help with whale flows, liquidations, network health, and DePIN tracking."
- If data is insufficient, say so and suggest where the user can look.
- Never make up specific numbers not in the context above.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) return json({ error: "Rate limit exceeded. Please try again shortly." }, 429);
      if (response.status === 402) return json({ error: "AI credits exhausted. Please add credits." }, 402);
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return json({ error: "AI gateway error" }, 500);
    }

    return new Response(response.body, {
      headers: { ...cors.headers, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat fatal error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...cors.headers, "Content-Type": "application/json" } }
    );
  }
});
