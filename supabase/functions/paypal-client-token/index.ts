import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const clientId = Deno.env.get("PAYPAL_CLIENT_ID");
    const clientSecret = Deno.env.get("PAYPAL_CLIENT_SECRET");
    if (!clientId || !clientSecret) {
      return new Response(JSON.stringify({ error: "PayPal not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = Date.now();
    if (cachedToken && now < cachedToken.expiresAt - 60_000) {
      return new Response(JSON.stringify({ accessToken: cachedToken.accessToken, expiresIn: Math.floor((cachedToken.expiresAt - now) / 1000) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const previewDomain = "id-preview--19dfb6f8-6d48-4348-b424-2070a2f80361.lovable.app";
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      response_type: "client_token",
      "intent": "sdk_init",
      "domains[]": previewDomain,
    });

    const resp = await fetch("https://api-m.sandbox.paypal.com/v1/oauth2/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("PayPal token error:", resp.status, errText);
      return new Response(JSON.stringify({ error: "Failed to get PayPal client token" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const accessToken = data.access_token;
    const expiresIn = data.expires_in || 3600;

    cachedToken = { accessToken, expiresAt: now + expiresIn * 1000 };

    return new Response(JSON.stringify({ accessToken, expiresIn }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("paypal-client-token error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
