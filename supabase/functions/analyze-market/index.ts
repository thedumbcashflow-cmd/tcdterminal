import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://tcdterminal.lovable.app",
  "https://id-preview--19dfb6f8-6d48-4348-b424-2070a2f80361.lovable.app",
  "https://19dfb6f8-6d48-4348-b424-2070a2f80361.lovableproject.com",
  "https://id-preview--19dfb6f8-6d48-4348-b424-2070a2f80361.lovableproject.com",
  "http://localhost:3000",
  "http://localhost:5173",
];

const baseCors = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Vary": "Origin",
};

function corsFor(req: Request) {
  const origin = req.headers.get("Origin");
  if (!origin) return { headers: baseCors, allowed: true, origin: null as string | null };
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
  if (req.method === "OPTIONS") {
    if (!cors.allowed) {
      logCorsDenied(req, cors.origin);
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(null, { headers: cors.headers });
  }
  if (!cors.allowed) {
    logCorsDenied(req, cors.origin);
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...cors.headers, "Content-Type": "application/json" },
      });
    }

    // Validate JWT — reject anon key / unauthenticated callers.
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...cors.headers, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub;

    const { asset_symbol } = await req.json().catch(() => ({}));

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Determine paywall tier — only pro/whale see premium intel.
    const { data: profile } = await supabaseAdmin
      .from("profiles").select("subscription_tier").eq("id", userId).maybeSingle();
    const isPaid = profile?.subscription_tier === "pro" || profile?.subscription_tier === "whale";

    let query = supabaseAdmin
      .from("market_intel")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (!isPaid) query = query.eq("is_premium", false);

    if (asset_symbol && typeof asset_symbol === "string" && asset_symbol.length <= 32) {
      query = query.eq("asset_symbol", asset_symbol);
    }

    const { data: intelData, error: dbError } = await query;

    if (dbError) {
      console.error("DB error:", dbError);
      return new Response(JSON.stringify({ error: "Failed to fetch market data" }), {
        status: 500,
        headers: { ...cors.headers, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...cors.headers, "Content-Type": "application/json" },
      });
    }

    const dataContext = intelData?.length
      ? `Here is the latest whale flow data:\n${JSON.stringify(intelData, null, 2)}`
      : "No whale flow data is currently available. Provide a general Solana market outlook.";

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "You are an institutional-grade Solana market analyst. Summarize whale flow patterns, identify accumulation/distribution trends, and flag notable wallet activity. Be concise and use data-driven language. Format with markdown for readability.",
          },
          { role: "user", content: dataContext },
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again shortly." }), {
          status: 429, headers: { ...cors.headers, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please top up." }), {
          status: 402, headers: { ...cors.headers, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI analysis unavailable" }), {
        status: 500, headers: { ...cors.headers, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...cors.headers, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("analyze-market error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...cors.headers, "Content-Type": "application/json" } }
    );
  }
});
