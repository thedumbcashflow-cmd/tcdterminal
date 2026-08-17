import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ArrowLeft, Shield } from "lucide-react";

type BillingPeriod = "monthly" | "quarterly" | "yearly";

const VALID_PLANS = ["pro", "whale", "trial"];
const VALID_PERIODS: BillingPeriod[] = ["monthly", "quarterly", "yearly"];

const PRICING: Record<string, Record<BillingPeriod, number>> = {
  pro: { monthly: 499, quarterly: 1347, yearly: 4491 },
  whale: { monthly: 2499, quarterly: 6747, yearly: 22491 },
  trial: { monthly: 1, quarterly: 1, yearly: 1 },
};

const PLAN_NAMES: Record<string, string> = { pro: "PRO", whale: "WHALE", trial: "7-DAY TRIAL" };

const PAYPAL_CLIENT_ID = import.meta.env.VITE_PAYPAL_CLIENT_ID as string | undefined;
if (!PAYPAL_CLIENT_ID || PAYPAL_CLIENT_ID.trim() === "") {
  // Fail fast so the error surfaces at load, not on button click.
  // eslint-disable-next-line no-console
  console.error("VITE_PAYPAL_CLIENT_ID is missing or empty. PayPal checkout will not work.");
}

declare global {
  interface Window {
    paypal?: any;
  }
}

// The SDK must be (re)loaded per intent: a trial uses `authorize` ($1 hold),
// every paid plan uses `capture`. Reusing an SDK loaded with the other intent
// silently breaks the order flow, so we tear it down when the intent changes.
let loadedIntent: "authorize" | "capture" | null = null;

function loadPayPalSdk(clientId: string, intent: "authorize" | "capture"): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector("script[data-paypal-sdk]");
    if (existing && loadedIntent === intent) {
      if (window.paypal) { resolve(); return; }
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("PayPal SDK failed")));
      return;
    }
    if (existing) {
      existing.remove();
      delete window.paypal;
    }
    const script = document.createElement("script");
    script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=USD&intent=${intent}`;
    script.async = true;
    script.setAttribute("data-paypal-sdk", "true");
    script.onload = () => { loadedIntent = intent; resolve(); };
    script.onerror = () => reject(new Error("PayPal SDK failed to load"));
    document.head.appendChild(script);
  });
}

const InvalidPlanState = () => {
  const navigate = useNavigate();
  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="text-center max-w-sm border border-border bg-card p-6">
        <Shield className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
        <h2 className="font-serif text-lg font-bold text-foreground">Invalid Plan</h2>
        <p className="mt-2 text-xs text-muted-foreground">
          This plan configuration is not recognised. Please return to Pricing.
        </p>
        <button
          onClick={() => navigate("/pricing")}
          className="mt-4 border border-primary bg-primary/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-primary hover:bg-primary/20 transition-colors"
        >
          View Pricing
        </button>
      </div>
    </div>
  );
};

const Checkout = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const plan = searchParams.get("plan") || "";
  const period = searchParams.get("period") || "";

  const isValid =
    VALID_PLANS.includes(plan) && VALID_PERIODS.includes(period as BillingPeriod);

  const prices = PRICING[plan];
  const amount = prices?.[period as BillingPeriod];

  const [sdkReady, setSdkReady] = useState(false);
  const [sdkError, setSdkError] = useState<string | null>(null);
  const [webhookError, setWebhookError] = useState<{
    code: string; message: string; orderId: string; requestId?: string;
    httpStatus?: number; paypalDebugId?: string;
  } | null>(null);
  const [processing, setProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [buttonError, setButtonError] = useState<string | null>(null);
  const [showCancelNote, setShowCancelNote] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonsRendered = useRef(false);

  useEffect(() => {
    if (!authLoading && !user) {
      const next = `${location.pathname}${location.search}`;
      navigate(`/auth?next=${encodeURIComponent(next)}`, { replace: true });
    }
  }, [user, authLoading, navigate]);

  // Phase 1: Load SDK for the intent this plan needs
  useEffect(() => {
    if (!isValid) return;
    if (!PAYPAL_CLIENT_ID) {
      setSdkError("Payment provider is not configured (missing client ID). Please contact support.");
      return;
    }
    let active = true;
    setSdkReady(false);
    buttonsRendered.current = false;
    loadPayPalSdk(PAYPAL_CLIENT_ID, plan === "trial" ? "authorize" : "capture")
      .then(() => { if (active) setSdkReady(true); })
      .catch(() => { if (active) setSdkError("Failed to load PayPal SDK. Please refresh."); });
    return () => { active = false; };
  }, [isValid, plan]);

  // Clear the PayPal button container on unmount so navigating away and back
  // never leaves a stale/duplicate button behind.
  useEffect(() => {
    const node = containerRef.current;
    return () => {
      if (node) node.innerHTML = "";
      buttonsRendered.current = false;
    };
  }, []);

  const handleApproval = useCallback(
    async (orderID: string) => {
      setProcessing(true);
      const isTrial = plan === "trial";
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const resp = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/payment-webhook`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${sessionData.session?.access_token}`,
            },
            body: JSON.stringify({
              event: isTrial ? "paypal.trial" : "paypal.capture",
              order_id: orderID,
              plan,
              period,
            }),
          }
        );
        const raw = await resp.text();
        let result: any = {};
        try { result = JSON.parse(raw); } catch { result = { _raw: raw }; }
        if (resp.ok && result.success) {
          // Only redirect after webhook confirms trial/subscription activation
          setPaymentSuccess(true);
          setTimeout(
            () =>
              navigate(
                isTrial
                  ? "/dashboard?trial=started"
                  : `/pricing?payment=success&plan=${plan}`
              ),
            2000
          );
        } else {
          setWebhookError({
            code: result.code || `http_${resp.status}`,
            message: result.error || result.message || (isTrial ? "Trial activation failed" : "Payment capture failed"),
            orderId: orderID,
            requestId: result.request_id,
            httpStatus: resp.status,
            paypalDebugId: result.paypal_debug_id,
          });
        }
      } catch (e) {
        setWebhookError({
          code: "network_error",
          message: (isTrial
            ? "Trial approved by PayPal but the activation request failed to reach our server."
            : "Subscription approved by PayPal but the confirmation request failed to reach our server."),
          orderId: orderID,
        });
      }
      setProcessing(false);
    },
    [plan, period, navigate]
  );

  // Phase 2: Render buttons
  useEffect(() => {
    if (!sdkReady || !containerRef.current || buttonsRendered.current || !isValid)
      return;
    buttonsRendered.current = true;
    containerRef.current.innerHTML = "";

    window.paypal
      .Buttons({
        style: {
          layout: "vertical",
          color: "gold",
          shape: "rect",
          label: "pay",
          height: 45,
        },
        createOrder: async () => {
          const { data: sessionData } = await supabase.auth.getSession();
          const resp = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${sessionData.session?.access_token}`,
              },
              body: JSON.stringify({ plan, period, provider: "paypal" }),
            }
          );
          const data = await resp.json();
          if (data.error) throw new Error(data.error);
          return data.order_id;
        },
        onApprove: (data: { orderID: string }) => handleApproval(data.orderID),
        onError: (err: Error) => {
          console.error("PayPal onError:", err);
          setButtonError(String(err));
        },
        onCancel: () => setShowCancelNote(true),
      })
      .render(containerRef.current);
  }, [sdkReady, isValid, plan, period, handleApproval]);

  if (!isValid) return <InvalidPlanState />;

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-md">
        <button
          onClick={() => navigate(`/pricing?period=${period}`)}
          className="mb-4 flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
        >
          <ArrowLeft className="h-3 w-3" /> Back to Pricing
        </button>

        <h1 className="font-serif text-xl font-bold text-primary mb-1">
          ◆ Checkout
        </h1>
        <p className="text-xs text-muted-foreground mb-6">
          Complete your {PLAN_NAMES[plan]} subscription
        </p>

        {/* Order Summary */}
        <div className="border border-border bg-card p-4 mb-4">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
            Order Summary
          </h2>
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-foreground">
              {PLAN_NAMES[plan]}{plan !== "trial" ? ` Plan (${period})` : ""}
            </span>
            <span className="font-data text-lg font-bold text-primary">
              ${amount?.toLocaleString()}.00
            </span>
          </div>
          {plan === "trial" && (
            <p className="mt-2 text-[10px] text-muted-foreground">
              $1 card hold to verify — voided immediately. Full Pro access for 7 days, then $499/mo.
            </p>
          )}
        </div>

        {/* Payment Success */}
        {paymentSuccess && (
          <div className="border border-terminal-green bg-terminal-green/10 p-4 mb-4 text-center">
            <p className="text-sm font-bold text-terminal-green">
              ✓ Payment Successful!
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Redirecting to your account...
            </p>
          </div>
        )}



        {/* Webhook error panel */}
        {webhookError && !paymentSuccess && (
          <div className="border border-destructive bg-destructive/10 p-4 mb-4">
            <p className="text-sm font-bold text-destructive uppercase tracking-wider">
              ⚠ {plan === "trial" ? "Trial Activation Failed" : "Payment Not Recorded"}
            </p>
            <p className="mt-2 text-xs text-foreground">{webhookError.message}</p>
            <div className="mt-3 grid grid-cols-1 gap-1 font-data text-[10px] text-muted-foreground">
              <div><span className="uppercase tracking-wider">Error code:</span> <span className="text-destructive">{webhookError.code}</span></div>
              <div><span className="uppercase tracking-wider">Order ID:</span> {webhookError.orderId}</div>
              {webhookError.requestId && <div><span className="uppercase tracking-wider">Request ID:</span> {webhookError.requestId}</div>}
              {webhookError.httpStatus && <div><span className="uppercase tracking-wider">HTTP:</span> {webhookError.httpStatus}</div>}
              {webhookError.paypalDebugId && <div><span className="uppercase tracking-wider">PayPal Debug ID:</span> {webhookError.paypalDebugId}</div>}
            </div>
            <div className="mt-3 border-t border-destructive/30 pt-2 text-[11px] text-foreground">
              <p className="font-bold uppercase tracking-wider text-muted-foreground mb-1">Next steps</p>
              {webhookError.code === "order_owned_by_other_user" && (
                <p>This PayPal order is tied to a different account. Sign in with that account or start a new checkout.</p>
              )}
              {webhookError.code === "paypal_authorize_http_error" && (
                <p>PayPal rejected the card at authorization. Try a different card or contact your bank. If it keeps failing, email support with the PayPal Debug ID above.</p>
              )}
              {webhookError.code === "paypal_credentials_missing" && (
                <p>The server is missing PayPal credentials. Contact support — no charge was made.</p>
              )}
              {webhookError.code === "paypal_token_failed" && (
                <p>We couldn't reach PayPal to confirm your payment. Wait a minute and retry; if it persists, contact support.</p>
              )}
              {webhookError.code === "network_error" && (
                <p>Your PayPal approval went through but our server didn't receive it. Do not re-pay — contact support with the Order ID and we'll activate your account.</p>
              )}
              {!["order_owned_by_other_user","paypal_authorize_http_error","paypal_credentials_missing","paypal_token_failed","network_error"].includes(webhookError.code) && (
                <p>Contact support with the Order ID and Request ID above — no need to retry payment.</p>
              )}
            </div>
            <button
              onClick={() => setWebhookError(null)}
              className="mt-3 border border-border bg-background px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
            >
              Dismiss
            </button>
          </div>
        )}


        {/* Processing overlay */}
        {processing && (
          <div className="border border-border bg-card p-4 mb-4 flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-xs text-muted-foreground">
              Processing payment...
            </span>
          </div>
        )}

        {/* PayPal Buttons */}
        {!paymentSuccess && (
          <div className="border border-border bg-card p-4">
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
              Pay with PayPal
            </h3>
            {!sdkReady && !sdkError && (
              <div className="flex items-center justify-center gap-2 py-6">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-xs text-muted-foreground">
                  Loading PayPal...
                </span>
              </div>
            )}
            <div ref={containerRef} />
            {sdkError && (
              <p className="mt-2 text-[10px] text-destructive">{sdkError}</p>
            )}
            {buttonError && (
              <p className="mt-2 text-[10px] text-destructive">{buttonError}</p>
            )}
            {showCancelNote && (
              <p className="mt-2 text-[10px] text-muted-foreground">
                Payment cancelled. Your plan is unchanged.
              </p>
            )}
          </div>
        )}

        <p className="mt-4 text-center text-[10px] text-muted-foreground">
          AES-256 encrypted ◆ Secure PayPal checkout ◆ Cancel anytime
        </p>
      </div>
    </div>
  );
};

export default Checkout;
