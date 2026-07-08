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
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Vary": "Origin",
};

function corsFor(req: Request) {
  const origin = req.headers.get("Origin");
  // Webhook callers (PayPal) typically have no Origin header — allow them.
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

const PERIOD_MONTHS: Record<string, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

const PRICING: Record<string, Record<string, number>> = {
  pro: { monthly: 499, quarterly: 1347, yearly: 4491 },
  whale: { monthly: 2499, quarterly: 6747, yearly: 22491 },
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
    // Require authenticated caller — binds capture to the signed-in user,
    // preventing replay of completed PayPal order_ids by third parties.
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...cors.headers, "Content-Type": "application/json" },
      });
    }
    const sbUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await sbUser.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...cors.headers, "Content-Type": "application/json" },
      });
    }
    const callerId = userData.user.id;

    const body = await req.json();
    const event = body.event;

    if (event === "paypal.trial") {
      const { order_id } = body;
      if (!order_id) {
        return new Response(JSON.stringify({ error: "Missing order_id", code: "missing_order_id" }), {
          status: 400, headers: { ...cors.headers, "Content-Type": "application/json" },
        });
      }

      // Idempotency: if this order_id was already processed for this caller,
      // return success without re-authorizing (PayPal would 422 on replay anyway).
      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      const { data: existing } = await supabaseAdmin
        .from("subscriptions")
        .select("user_id, current_period_end, status")
        .eq("provider", "paypal")
        .eq("provider_subscription_id", order_id)
        .maybeSingle();
      if (existing) {
        if (existing.user_id !== callerId) {
          return new Response(JSON.stringify({ error: "Forbidden", code: "order_owned_by_other_user" }), {
            status: 403, headers: { ...cors.headers, "Content-Type": "application/json" },
          });
        }
        console.log(`Idempotent replay of trial order ${order_id} for user ${callerId}`);
        return new Response(JSON.stringify({
          success: true,
          idempotent: true,
          trial_ends_at: existing.current_period_end,
        }), { headers: { ...cors.headers, "Content-Type": "application/json" } });
      }

      const clientId = Deno.env.get("PAYPAL_CLIENT_ID");
      const clientSecret = Deno.env.get("PAYPAL_CLIENT_SECRET");

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

      // Authorize the order (creates a hold, no funds captured)
      const authorizeResp = await fetch(
        `${PAYPAL_BASE}/v2/checkout/orders/${encodeURIComponent(order_id)}/authorize`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );
      const authorizeData = await authorizeResp.json();
      if (authorizeData.status !== "COMPLETED") {
        console.error("PayPal authorize not completed:", authorizeData);
        return new Response(JSON.stringify({ error: "Authorization not completed", details: authorizeData.status }), {
          status: 400, headers: { ...cors.headers, "Content-Type": "application/json" },
        });
      }

      const purchaseUnit = authorizeData.purchase_units?.[0];
      const authorization = purchaseUnit?.payments?.authorizations?.[0];
      const authorizationId = authorization?.id;
      const customId = authorization?.custom_id || purchaseUnit?.custom_id;

      let userId = "";
      try {
        const parsed = JSON.parse(customId || "{}");
        userId = parsed.user_id;
      } catch {
        return new Response(JSON.stringify({ error: "Invalid custom_id format" }), {
          status: 400, headers: { ...cors.headers, "Content-Type": "application/json" },
        });
      }

      if (!userId || userId !== callerId) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...cors.headers, "Content-Type": "application/json" },
        });
      }

      // Void the $1 hold immediately — no funds are ever captured
      if (authorizationId) {
        const voidResp = await fetch(
          `${PAYPAL_BASE}/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/void`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        );
        if (!voidResp.ok) {
          console.error("PayPal void failed:", await voidResp.text());
          // Continue anyway — the auth will expire in ~3 days if not captured
        }
      }

      // supabaseAdmin already created above for idempotency check


      // Grant Pro access for 7 days (trial). Tier stays 'pro'; trial_ends_at
      // gates access. Nightly cron flips to 'free' after expiry.
      const trialEnds = new Date();
      trialEnds.setDate(trialEnds.getDate() + 7);

      await supabaseAdmin.from("profiles").update({
        subscription_tier: "pro",
        trial_ends_at: trialEnds.toISOString(),
      }).eq("id", userId);

      await supabaseAdmin.from("subscriptions").upsert({
        user_id: userId,
        plan: "pro",
        status: "trialing",
        provider: "paypal",
        provider_subscription_id: order_id,
        current_period_end: trialEnds.toISOString(),
      }, { onConflict: "user_id" });

      console.log(`Started 7-day trial for user ${userId} (auth ${authorizationId} voided)`);

      return new Response(JSON.stringify({ success: true, trial_ends_at: trialEnds.toISOString() }), {
        headers: { ...cors.headers, "Content-Type": "application/json" },
      });
    }


    if (event === "paypal.capture") {
      const { order_id } = body;

      if (!order_id) {
        return new Response(JSON.stringify({ error: "Missing order_id" }), {
          status: 400, headers: { ...cors.headers, "Content-Type": "application/json" },
        });
      }

      const clientId = Deno.env.get("PAYPAL_CLIENT_ID");
      const clientSecret = Deno.env.get("PAYPAL_CLIENT_SECRET");

      const tokenResp = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
      });
      const tokenData = await tokenResp.json();

      const captureResp = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${encodeURIComponent(order_id)}/capture`, {
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

      // Defense-in-depth: caller must match the user_id embedded in the PayPal order.
      if (userId !== callerId) {
        console.error(`payment-webhook caller mismatch: caller=${callerId} order user_id=${userId}`);
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...cors.headers, "Content-Type": "application/json" },
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
