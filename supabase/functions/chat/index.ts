import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Authenticate the caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub;

    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Use service role to fetch market intel context
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check user's subscription tier to decide premium data access
    const { data: profile } = await supabase
      .from("profiles")
      .select("subscription_tier")
      .eq("id", userId)
      .maybeSingle();

    const isPaid = profile?.subscription_tier === "pro" || profile?.subscription_tier === "whale";

    // Build whale flows query — restrict premium data for free users
    let whaleQuery = supabase
      .from("market_intel")
      .select("*")
      .eq("intel_type", "whale_flow")
      .order("created_at", { ascending: false })
      .limit(20);
    if (!isPaid) {
      whaleQuery = whaleQuery.eq("is_premium", false);
    }
    const { data: whaleFlows } = await whaleQuery;

    let liqQuery = supabase
      .from("market_intel")
      .select("*")
      .eq("intel_type", "liquidation")
      .order("created_at", { ascending: false })
      .limit(20);
    if (!isPaid) {
      liqQuery = liqQuery.eq("is_premium", false);
    }
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
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
