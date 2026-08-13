import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://tcdterminal.lovable.app",
  "https://id-preview--19dfb6f8-6d48-4348-b424-2070a2f80361.lovable.app",
  "https://19dfb6f8-6d48-4348-b424-2070a2f80361.lovableproject.com",
  "https://id-preview--19dfb6f8-6d48-4348-b424-2070a2f80361.lovableproject.com",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:8080",
];

const baseCors = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

const PRICING: Record<string, Record<string, number>> = {
  pro: { monthly: 499, quarterly: 1347, yearly: 4491 },
  whale: { monthly: 2499, quarterly: 6747, yearly: 22491 },
  trial: { monthly: 1, quarterly: 1, yearly: 1 },
};

const PAYPAL_BASE = "https://api-m.paypal.com";

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
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...cors.headers, "Content-Type": "application/json" },
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
        status: 401, headers: { ...cors.headers, "Content-Type": "application/json" },
      });
    }

    const { plan, period = "monthly" } = await req.json();
    const prices = PRICING[plan];
    if (!prices || !prices[period]) {
      return new Response(JSON.stringify({ error: "Invalid plan or period" }), {
        status: 400, headers: { ...cors.headers, "Content-Type": "application/json" },
      });
    }

    const amount = prices[period];

    const clientId = Deno.env.get("PAYPAL_CLIENT_ID");
    const clientSecret = Deno.env.get("PAYPAL_CLIENT_SECRET");
    if (!clientId || !clientSecret) {
      return new Response(JSON.stringify({ error: "PayPal not configured" }), {
        status: 500, headers: { ...cors.headers, "Content-Type": "application/json" },
      });
    }

    const tokenResp = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    const tokenData = await tokenResp.json();
    const accessToken = tokenData.access_token;

    const returnOrigin = cors.origin || "https://tcdterminal.lovable.app";
    const isTrial = plan === "trial";
    const orderResp = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        intent: isTrial ? "AUTHORIZE" : "CAPTURE",
        purchase_units: [{
          amount: { currency_code: "USD", value: amount.toFixed(2) },
          description: isTrial
            ? "TCD Terminal — 7-day trial verification ($1 hold, voided)"
            : `TCD Terminal ${plan.toUpperCase()} - ${period}`,
          custom_id: JSON.stringify({ user_id: user.id, plan, period }),
        }],
        application_context: {
          brand_name: "TCD Terminal",
          return_url: isTrial
            ? `${returnOrigin}/dashboard?trial=started`
            : `${returnOrigin}/pricing?payment=success&plan=${plan}`,
          cancel_url: `${returnOrigin}/pricing`,
        },
      }),
    });

    const orderData = await orderResp.json();
    if (!orderResp.ok) {
      console.error("PayPal order error:", orderData);
      return new Response(JSON.stringify({ error: "Failed to create PayPal order" }), {
        status: 502, headers: { ...cors.headers, "Content-Type": "application/json" },
      });
    }

    const approvalLink = orderData.links?.find((l: any) => l.rel === "approve")?.href;

    return new Response(JSON.stringify({
      order_id: orderData.id,
      approval_url: approvalLink,
    }), {
      headers: { ...cors.headers, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("create-checkout error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...cors.headers, "Content-Type": "application/json" },
    });
  }
});
