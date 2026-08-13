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

const NOTIFY_TO = Deno.env.get("SOVEREIGN_NOTIFY_EMAIL") || "thedumbcashflow@gmail.com";
const FROM_ADDR = Deno.env.get("SOVEREIGN_NOTIFY_FROM") || "TCD Terminal <onboarding@resend.dev>";

function corsFor(req: Request) {
  const origin = req.headers.get("Origin");
  const base = {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    return { headers: { ...base, "Access-Control-Allow-Origin": origin }, allowed: true };
  }
  return { headers: base, allowed: !origin };
}

serve(async (req) => {
  const cors = corsFor(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors.headers });
  if (!cors.allowed) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { ...cors.headers, "Content-Type": "application/json" },
    });
  }

  try {
    // Require authenticated caller
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

    const { application_id } = await req.json();
    if (!application_id || typeof application_id !== "string") {
      return new Response(JSON.stringify({ error: "Missing application_id" }), {
        status: 400, headers: { ...cors.headers, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: app, error: appErr } = await admin
      .from("sovereign_applications")
      .select("id, applicant_name, fund_name, aum_bracket, contact_email, message, user_id, created_at")
      .eq("id", application_id)
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (appErr || !app) {
      return new Response(JSON.stringify({ error: "Application not found" }), {
        status: 404, headers: { ...cors.headers, "Content-Type": "application/json" },
      });
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      console.error("RESEND_API_KEY not configured");
      return new Response(JSON.stringify({ error: "Email service not configured" }), {
        status: 500, headers: { ...cors.headers, "Content-Type": "application/json" },
      });
    }

    const esc = (s: string) =>
      String(s ?? "").replace(/[&<>"']/g, (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

    const html = `
      <h2>New Sovereign Titan Application</h2>
      <p><strong>Name:</strong> ${esc(app.applicant_name)}</p>
      <p><strong>Fund:</strong> ${esc(app.fund_name)}</p>
      <p><strong>AUM:</strong> ${esc(app.aum_bracket)}</p>
      <p><strong>Contact:</strong> ${esc(app.contact_email)}</p>
      ${app.message ? `<p><strong>Message:</strong><br>${esc(app.message).replace(/\n/g, "<br>")}</p>` : ""}
      <hr>
      <p style="color:#666;font-size:12px">Application ID: ${esc(app.id)} · Submitted ${esc(app.created_at)}</p>
    `;

    const resendResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDR,
        to: [NOTIFY_TO],
        reply_to: app.contact_email,
        subject: `Sovereign application: ${app.fund_name} (${app.aum_bracket})`,
        html,
      }),
    });

    if (!resendResp.ok) {
      const txt = await resendResp.text();
      console.error(`Resend failed [${resendResp.status}]: ${txt}`);
      await admin.from("sovereign_applications").update({
        email_error: `[${resendResp.status}] ${txt.slice(0, 500)}`,
      }).eq("id", app.id);
      return new Response(JSON.stringify({ error: "Email send failed", status: resendResp.status, details: txt }), {
        status: 502, headers: { ...cors.headers, "Content-Type": "application/json" },
      });
    }

    const resendData = await resendResp.json().catch(() => ({}));
    await admin.from("sovereign_applications").update({
      email_sent_at: new Date().toISOString(),
      email_message_id: resendData?.id ?? null,
      email_error: null,
    }).eq("id", app.id);

    console.log(`Sovereign notification sent for application ${app.id} to ${NOTIFY_TO}`);
    return new Response(JSON.stringify({ success: true, recipient: NOTIFY_TO, message_id: resendData?.id ?? null }), {
      headers: { ...cors.headers, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("notify-sovereign-application error:", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { "Content-Type": "application/json", ...cors.headers },
    });
  }
});
