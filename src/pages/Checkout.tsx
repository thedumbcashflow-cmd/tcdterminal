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

function loadPayPalSdk(clientId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.paypal) {
      resolve();
      return;
    }
    const existing = document.querySelector("script[data-paypal-sdk]");
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("PayPal SDK failed")));
      return;
    }
    const script = document.createElement("script");
    script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=USD&intent=${window.location.search.includes("plan=trial") ? "authorize" : "capture"}`;
    script.async = true;
    script.setAttribute("data-paypal-sdk", "true");
    script.onload = () => resolve();
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
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  // Phase 1: Load SDK
  useEffect(() => {
    if (!isValid) return;
    if (!PAYPAL_CLIENT_ID) {
      setSdkError("Payment provider is not configured (missing client ID). Please contact support.");
      return;
    }
    loadPayPalSdk(PAYPAL_CLIENT_ID)
      .then(() => setSdkReady(true))
      .catch(() => setSdkError("Failed to load PayPal SDK. Please refresh."));
  }, [isValid]);

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
        const result = await resp.json();
        if (result.success) {
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
          setSdkError(
            (isTrial ? "Trial activation failed" : "Payment capture failed") +
              ". Please contact support with reference: " +
              orderID
          );
        }
      } catch {
        setSdkError(
          (isTrial
            ? "Trial approved by PayPal but could not be activated"
            : "Subscription approved by PayPal but could not be saved") +
            ". Please contact support with reference: " +
            orderID
        );
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
