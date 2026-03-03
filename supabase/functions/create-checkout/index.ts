import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PRICING: Record<string, Record<string, number>> = {
  pro: { monthly: 199, quarterly: 549, yearly: 1999 },
  whale: { monthly: 799, quarterly: 2199, yearly: 7999 },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { plan, period = "monthly", provider } = await req.json();
    const prices = PRICING[plan];
    if (!prices || !prices[period]) {
      return new Response(JSON.stringify({ error: "Invalid plan or period" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const amount = prices[period];

    // PayPal order creation
    const clientId = Deno.env.get("PAYPAL_CLIENT_ID");
    const clientSecret = Deno.env.get("PAYPAL_CLIENT_SECRET");
    if (!clientId || !clientSecret) {
      return new Response(JSON.stringify({ error: "PayPal not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get access token
    const tokenResp = await fetch("https://api-m.sandbox.paypal.com/v1/oauth2/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    const tokenData = await tokenResp.json();
    const accessToken = tokenData.access_token;

    // Create order
    const orderResp = await fetch("https://api-m.sandbox.paypal.com/v2/checkout/orders", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{
          amount: {
            currency_code: "USD",
            value: amount.toFixed(2),
          },
          description: `TCD Terminal ${plan.toUpperCase()} - ${period}`,
          custom_id: JSON.stringify({ user_id: user.id, plan, period }),
        }],
        application_context: {
          brand_name: "TCD Terminal",
          return_url: `${req.headers.get("origin") || "https://id-preview--19dfb6f8-6d48-4348-b424-2070a2f80361.lovable.app"}/pricing?payment=success&plan=${plan}`,
          cancel_url: `${req.headers.get("origin") || "https://id-preview--19dfb6f8-6d48-4348-b424-2070a2f80361.lovable.app"}/pricing`,
        },
      }),
    });

    const orderData = await orderResp.json();
    if (!orderResp.ok) {
      console.error("PayPal order error:", orderData);
      return new Response(JSON.stringify({ error: "Failed to create PayPal order" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const approvalLink = orderData.links?.find((l: any) => l.rel === "approve")?.href;

    return new Response(JSON.stringify({
      order_id: orderData.id,
      approval_url: approvalLink,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("create-checkout error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
