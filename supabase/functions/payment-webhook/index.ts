import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PERIOD_MONTHS: Record<string, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const event = body.event;

    if (event === "paypal.capture") {
      const { order_id, plan, period = "monthly" } = body;

      if (!order_id || !plan) {
        return new Response(JSON.stringify({ error: "Missing order_id or plan" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Capture the PayPal order server-side
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

      const captureResp = await fetch(`https://api-m.sandbox.paypal.com/v2/checkout/orders/${order_id}/capture`, {
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
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Extract user_id from custom_id
      let userId = "";
      try {
        const purchaseUnit = captureData.purchase_units?.[0];
        const customId = purchaseUnit?.payments?.captures?.[0]?.custom_id || purchaseUnit?.custom_id;
        if (customId) {
          const parsed = JSON.parse(customId);
          userId = parsed.user_id;
        }
      } catch {
        // fallback: get from auth header
      }

      // Fallback: get user from auth header
      if (!userId) {
        const authHeader = req.headers.get("Authorization");
        if (authHeader) {
          const supabaseAuth = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_ANON_KEY")!,
            { global: { headers: { Authorization: authHeader } } }
          );
          const { data: { user } } = await supabaseAuth.auth.getUser();
          if (user) userId = user.id;
        }
      }

      if (!userId) {
        return new Response(JSON.stringify({ error: "Could not identify user" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      // Update subscription tier
      await supabaseAdmin.from("profiles").update({
        subscription_tier: plan,
      }).eq("id", userId);

      // Upsert subscriptions record
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
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("payment-webhook error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
