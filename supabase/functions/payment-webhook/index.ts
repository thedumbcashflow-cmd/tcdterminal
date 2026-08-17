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

    // Shared audit-log client (best-effort — logging failures never break the flow)
    const auditAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const auditLog = async (row: {
      request_id?: string; order_id?: string; paypal_event: string;
      status: string; http_status?: number; error_code?: string; error_message?: string;
      payload?: unknown;
    }) => {
      try {
        await auditAdmin.from("payment_webhook_log").insert({
          request_id: row.request_id ?? null,
          order_id: row.order_id ?? null,
          paypal_event: row.paypal_event,
          caller_user_id: callerId,
          status: row.status,
          http_status: row.http_status ?? null,
          error_code: row.error_code ?? null,
          error_message: row.error_message ?? null,
          payload: (row.payload as any) ?? null,
        });
      } catch (e) {
        console.error("audit_log_insert_failed", String(e));
      }
    };

    if (event === "paypal.trial") {
      const request_id = crypto.randomUUID();
      const trialLog = (level: "log" | "error", msg: string, extra?: unknown) => {
        const line = JSON.stringify({
          request_id, event: "paypal.trial", caller: callerId, msg, ...(extra as object || {}),
        });
        if (level === "error") console.error(line); else console.log(line);
      };
      const fail = (status: number, code: string, message: string, extra?: unknown) => {
        trialLog("error", message, { code, status, ...(extra as object || {}) });
        void auditLog({
          request_id, order_id: body?.order_id, paypal_event: "paypal.trial",
          status: "error", http_status: status, error_code: code, error_message: message,
          payload: extra,
        });
        return new Response(
          JSON.stringify({ success: false, error: message, code, request_id, ...(extra as object || {}) }),
          { status, headers: { ...cors.headers, "Content-Type": "application/json" } },
        );
      };

      const { order_id } = body;
      if (!order_id || typeof order_id !== "string") {
        return fail(400, "missing_order_id", "Missing or invalid order_id");
      }
      trialLog("log", "trial_request_received", { order_id });

      // Idempotency check
      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const { data: existing, error: existingErr } = await supabaseAdmin
        .from("subscriptions")
        .select("user_id, current_period_end, status")
        .eq("provider", "paypal")
        .eq("provider_subscription_id", order_id)
        .maybeSingle();
      if (existingErr) {
        return fail(500, "db_lookup_failed", "Could not check existing subscription", { db_error: existingErr.message });
      }
      if (existing) {
        if (existing.user_id !== callerId) {
          return fail(403, "order_owned_by_other_user", "This order belongs to another account");
        }
        trialLog("log", "idempotent_replay", { order_id, trial_ends_at: existing.current_period_end });
        void auditLog({ request_id, order_id, paypal_event: "paypal.trial", status: "idempotent", http_status: 200 });
        return new Response(JSON.stringify({
          success: true, idempotent: true, request_id,
          trial_ends_at: existing.current_period_end,
        }), { headers: { ...cors.headers, "Content-Type": "application/json" } });
      }

      const clientId = Deno.env.get("PAYPAL_CLIENT_ID");
      const clientSecret = Deno.env.get("PAYPAL_CLIENT_SECRET");
      if (!clientId || !clientSecret) {
        return fail(500, "paypal_credentials_missing", "PayPal credentials not configured");
      }

      // Get PayPal access token
      let accessToken: string;
      try {
        const tokenResp = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
          method: "POST",
          headers: {
            Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: "grant_type=client_credentials",
        });
        if (!tokenResp.ok) {
          const txt = await tokenResp.text();
          return fail(502, "paypal_token_failed", "Could not obtain PayPal access token", {
            paypal_status: tokenResp.status, paypal_body: txt.slice(0, 500),
          });
        }
        const tokenData = await tokenResp.json();
        accessToken = tokenData.access_token;
        if (!accessToken) {
          return fail(502, "paypal_token_missing", "PayPal returned no access_token");
        }
      } catch (e) {
        return fail(502, "paypal_token_network", "Network error obtaining PayPal token", { detail: String(e) });
      }

      // Authorize the order
      let authorizeData: any;
      try {
        const authorizeResp = await fetch(
          `${PAYPAL_BASE}/v2/checkout/orders/${encodeURIComponent(order_id)}/authorize`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
              "PayPal-Request-Id": `trial-${order_id}`,
            },
          },
        );
        const rawText = await authorizeResp.text();
        try { authorizeData = JSON.parse(rawText); } catch { authorizeData = { _raw: rawText }; }
        if (!authorizeResp.ok) {
          const debugId = authorizeResp.headers.get("paypal-debug-id");
          return fail(502, "paypal_authorize_http_error", "PayPal authorize call failed", {
            paypal_status: authorizeResp.status,
            paypal_debug_id: debugId,
            paypal_name: authorizeData?.name,
            paypal_message: authorizeData?.message,
            paypal_details: authorizeData?.details,
          });
        }
      } catch (e) {
        return fail(502, "paypal_authorize_network", "Network error calling PayPal authorize", { detail: String(e) });
      }

      if (authorizeData.status !== "COMPLETED") {
        return fail(400, "paypal_authorize_not_completed", "PayPal did not complete authorization", {
          paypal_status: authorizeData.status,
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
        return fail(400, "invalid_custom_id", "custom_id on the order is not valid JSON");
      }
      if (!userId) {
        return fail(400, "missing_user_id_in_order", "custom_id did not include a user_id");
      }
      if (userId !== callerId) {
        return fail(403, "caller_mismatch", "Caller does not match the user_id embedded in the order");
      }

      // Void the $1 hold immediately — no funds are ever captured
      if (authorizationId) {
        try {
          const voidResp = await fetch(
            `${PAYPAL_BASE}/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/void`,
            { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } },
          );
          if (!voidResp.ok) {
            const txt = await voidResp.text();
            trialLog("error", "paypal_void_failed_nonfatal", {
              paypal_status: voidResp.status, paypal_body: txt.slice(0, 300),
            });
            // Non-fatal: the auth will expire in ~3 days
          } else {
            trialLog("log", "paypal_void_ok", { authorization_id: authorizationId });
          }
        } catch (e) {
          trialLog("error", "paypal_void_network_nonfatal", { detail: String(e) });
        }
      }

      // Grant Pro access for 7 days
      const trialEnds = new Date();
      trialEnds.setDate(trialEnds.getDate() + 7);

      const { error: profErr } = await supabaseAdmin.from("profiles").update({
        subscription_tier: "pro",
        trial_started_at: new Date().toISOString(),
        trial_ends_at: trialEnds.toISOString(),
      }).eq("id", userId);
      if (profErr) {
        return fail(500, "profile_update_failed", "Could not upgrade profile to trial", { db_error: profErr.message });
      }

      const { error: subErr } = await supabaseAdmin.from("subscriptions").upsert({
        user_id: userId,
        plan: "pro",
        status: "trialing",
        provider: "paypal",
        provider_subscription_id: order_id,
        current_period_end: trialEnds.toISOString(),
      }, { onConflict: "user_id" });
      if (subErr) {
        return fail(500, "subscription_upsert_failed", "Could not record trial subscription", { db_error: subErr.message });
      }

      trialLog("log", "trial_activated", {
        order_id, authorization_id: authorizationId, trial_ends_at: trialEnds.toISOString(),
      });
      void auditLog({
        request_id, order_id, paypal_event: "paypal.trial", status: "success", http_status: 200,
        payload: { authorization_id: authorizationId, trial_ends_at: trialEnds.toISOString() },
      });

      return new Response(JSON.stringify({
        success: true, request_id, trial_ends_at: trialEnds.toISOString(),
      }), { headers: { ...cors.headers, "Content-Type": "application/json" } });
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

      // Converting to a paid plan ends any trial state.
      const { error: paidProfErr } = await supabaseAdmin.from("profiles").update({
        subscription_tier: plan,
        subscription_period: period,
        subscribed_at: new Date().toISOString(),
        trial_ends_at: null,
      }).eq("id", userId);
      if (paidProfErr) {
        void auditLog({
          order_id, paypal_event: "paypal.capture", status: "error", http_status: 500,
          error_code: "profile_update_failed", error_message: paidProfErr.message,
        });
        return new Response(JSON.stringify({
          error: "Payment captured but the account could not be upgraded. Contact support with your order ID.",
          code: "profile_update_failed",
        }), { status: 500, headers: { ...cors.headers, "Content-Type": "application/json" } });
      }

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
      void auditLog({
        order_id, paypal_event: "paypal.capture", status: "success", http_status: 200,
        payload: { plan, period, amount: capturedAmount },
      });

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
