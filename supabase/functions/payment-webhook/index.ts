import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://tcdterminal.lovable.app",
  "https://id-preview--19dfb6f8-6d48-4348-b424-2070a2f80361.lovable.app",
  "http://localhost:3000",
  "http://localhost:5173",
];

const baseCors = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Vary": "Origin",
};

function corsFor(req: Request) {
  const origin = req.headers.get("Origin");
  // Webhook callers (PayPal) typically have no Origin header — allow them.
  if (!origin) return { headers: baseCors, allowed: true };
  if (ALLOWED_ORIGINS.includes(origin)) {
    return { headers: { ...baseCors, "Access-Control-Allow-Origin": origin }, allowed: true };
  }
  return { headers: baseCors, allowed: false };
}

const PERIOD_MONTHS: Record<string, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

const PRICING: Record<string, Record<string, number>> = {
  pro: { monthly: 199, quarterly: 549, yearly: 1999 },
  whale: { monthly: 799, quarterly: 2199, yearly: 7999 },
};

serve(async (req) => {
  const cors = corsFor(req);
  if (req.method === "OPTIONS") {
    if (!cors.allowed) return new Response("Forbidden", { status: 403 });
    return new Response(null, { headers: cors.headers });
  }
  if (!cors.allowed) {
    return new Response(JSON.stringify({ error: "Origin not allowed" }), {
      status: 403, headers: { ...cors.headers, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const event = body.event;

    if (event === "paypal.capture") {
      const { order_id } = body;

      if (!order_id) {
        return new Response(JSON.stringify({ error: "Missing order_id" }), {
          status: 400, headers: { ...cors.headers, "Content-Type": "application/json" },
        });
      }

      const clientId = Deno.env.get("PAYPAL_CLIENT_ID");
      const clientSecret = Deno.env.get("PAYPAL_CLIENT_SECRET");

      const tokenResp = await fetch("https://api-m.sandbox.paypal.com/v1/oauth2/token", {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
      });
      const tokenData = await tokenResp.json();

      const captureResp = await fetch(`https://api-m.sandbox.paypal.com/v2/checkout/orders/${encodeURIComponent(order_id)}/capture`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          "Content-Type": "application/json",
        },
      });

      const captureData = await captureResp.json();
      if (captureData.status !== "COMPLETED") {
        console.error("PayPal capture not completed:", captureData);
        return new Response(JSON.stringify({ error: "Payment not completed", details: captureData.status }), {
          status: 400, headers: { ...cors.headers, "Content-Type": "application/json" },
        });
      }

      const purchaseUnit = captureData.purchase_units?.[0];
      const customId = purchaseUnit?.payments?.captures?.[0]?.custom_id || purchaseUnit?.custom_id;

      if (!customId) {
        return new Response(JSON.stringify({ error: "Missing custom_id in PayPal order" }), {
          status: 400, headers: { ...cors.headers, "Content-Type": "application/json" },
        });
      }

      let userId = "";
      let plan = "";
      let period = "monthly";
      try {
        const parsed = JSON.parse(customId);
        userId = parsed.user_id;
        plan = parsed.plan;
        period = parsed.period || "monthly";
      } catch {
        return new Response(JSON.stringify({ error: "Invalid custom_id format" }), {
          status: 400, headers: { ...cors.headers, "Content-Type": "application/json" },
        });
      }

      if (!userId || !plan) {
        return new Response(JSON.stringify({ error: "Missing user_id or plan in custom_id" }), {
          status: 400, headers: { ...cors.headers, "Content-Type": "application/json" },
        });
      }

      if (!PRICING[plan] || !PRICING[plan][period]) {
        return new Response(JSON.stringify({ error: "Invalid plan or period in custom_id" }), {
          status: 400, headers: { ...cors.headers, "Content-Type": "application/json" },
        });
      }

      const capturedAmount = parseFloat(
        purchaseUnit?.payments?.captures?.[0]?.amount?.value || "0"
      );
      const expectedAmount = PRICING[plan][period];
      if (capturedAmount !== expectedAmount) {
        console.error(`Amount mismatch: captured ${capturedAmount}, expected ${expectedAmount} for ${plan}/${period}`);
        return new Response(JSON.stringify({ error: "Payment amount mismatch" }), {
          status: 400, headers: { ...cors.headers, "Content-Type": "application/json" },
        });
      }

      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      await supabaseAdmin.from("profiles").update({
        subscription_tier: plan,
      }).eq("id", userId);

      const months = PERIOD_MONTHS[period] || 1;
      const periodEnd = new Date();
      periodEnd.setMonth(periodEnd.getMonth() + months);

      await supabaseAdmin.from("subscriptions").upsert({
        user_id: userId,
        plan,
        status: "active",
        provider: "paypal",
        provider_subscription_id: order_id,
        current_period_end: periodEnd.toISOString(),
      }, { onConflict: "user_id" });

      console.log(`Upgraded user ${userId} to ${plan} (${period})`);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...cors.headers, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...cors.headers, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("payment-webhook error:", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...cors.headers, "Content-Type": "application/json" },
    });
  }
});
