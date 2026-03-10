import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ArrowLeft } from "lucide-react";

type BillingPeriod = "monthly" | "quarterly" | "yearly";

const PRICING: Record<string, Record<BillingPeriod, number>> = {
  pro: { monthly: 199, quarterly: 549, yearly: 1999 },
  whale: { monthly: 799, quarterly: 2199, yearly: 7999 },
};

const PLAN_NAMES: Record<string, string> = { pro: "PRO", whale: "WHALE" };

const PAYPAL_CLIENT_ID = "ASzeRnkGYZQQppiMbDgOEKDFnvZrdC4DGELXwkSkOGMzD_2j2eh3TnQ53hj8r-eU3h-Q5HaMC3mLme00";

const Checkout = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const plan = searchParams.get("plan") || "pro";
  const period = (searchParams.get("period") as BillingPeriod) || "monthly";
  const prices = PRICING[plan];
  const amount = prices?.[period];

  const [sdkReady, setSdkReady] = useState(false);
  const [sdkError, setSdkError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const buttonsContainerRef = useRef<HTMLDivElement>(null);
  const buttonsRendered = useRef(false);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  // Load PayPal JS SDK (standard buttons)
  useEffect(() => {
    if (document.getElementById("paypal-sdk-script")) {
      if ((window as any).paypal?.Buttons) setSdkReady(true);
      return;
    }

    const script = document.createElement("script");
    script.id = "paypal-sdk-script";
    script.src = `https://www.sandbox.paypal.com/sdk/js?client-id=${PAYPAL_CLIENT_ID}&currency=USD&intent=capture`;
    script.onload = () => setSdkReady(true);
    script.onerror = () => setSdkError("Failed to load PayPal SDK. Please refresh.");
    document.head.appendChild(script);
  }, []);

  const renderButtons = useCallback(async () => {
    const pp = (window as any).paypal;
    if (!pp?.Buttons || !buttonsContainerRef.current || buttonsRendered.current) return;
    buttonsRendered.current = true;

    pp.Buttons({
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
      onApprove: async (data: { orderID: string }) => {
        setProcessing(true);
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
                event: "paypal.capture",
                order_id: data.orderID,
                plan,
                period,
              }),
            }
          );
          const result = await resp.json();
          if (result.success) {
            setPaymentSuccess(true);
            setTimeout(() => navigate(`/pricing?payment=success&plan=${plan}`), 2000);
          } else {
            setSdkError("Payment capture failed. Please contact support.");
          }
        } catch {
          setSdkError("Payment processing error. Please try again.");
        }
        setProcessing(false);
      },
      onError: (err: Error) => {
        console.error("PayPal error:", err);
        setSdkError("PayPal encountered an error. Please try again.");
      },
    }).render(buttonsContainerRef.current);
  }, [plan, period, navigate]);

  // Render buttons when SDK is ready
  useEffect(() => {
    if (sdkReady && buttonsContainerRef.current && !buttonsRendered.current) {
      renderButtons();
    }
  }, [sdkReady, renderButtons]);

  if (!prices || !amount) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">Invalid plan selected.</p>
          <button onClick={() => navigate("/pricing")} className="mt-3 text-xs text-primary hover:underline">← Back to Pricing</button>
        </div>
      </div>
    );
  }

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
        <button onClick={() => navigate(`/pricing?period=${period}`)} className="mb-4 flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
          <ArrowLeft className="h-3 w-3" /> Back to Pricing
        </button>

        <h1 className="font-serif text-xl font-bold text-primary mb-1">◆ Checkout</h1>
        <p className="text-xs text-muted-foreground mb-6">Complete your {PLAN_NAMES[plan]} subscription</p>

        {/* Order Summary */}
        <div className="border border-border bg-card p-4 mb-4">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Order Summary</h2>
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-foreground">{PLAN_NAMES[plan]} Plan ({period})</span>
            <span className="font-data text-lg font-bold text-primary">${amount.toLocaleString()}.00</span>
          </div>
        </div>

        {/* Payment Success */}
        {paymentSuccess && (
          <div className="border border-terminal-green bg-terminal-green/10 p-4 mb-4 text-center">
            <p className="text-sm font-bold text-terminal-green">✓ Payment Successful!</p>
            <p className="text-xs text-muted-foreground mt-1">Redirecting to your account...</p>
          </div>
        )}

        {/* Processing overlay */}
        {processing && (
          <div className="border border-border bg-card p-4 mb-4 flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-xs text-muted-foreground">Processing payment...</span>
          </div>
        )}

        {/* PayPal Buttons */}
        {!paymentSuccess && (
          <div className="border border-border bg-card p-4">
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Pay with PayPal</h3>
            {!sdkReady && !sdkError && (
              <div className="flex items-center justify-center gap-2 py-6">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-xs text-muted-foreground">Loading PayPal...</span>
              </div>
            )}
            <div ref={buttonsContainerRef} />
            {sdkError && <p className="mt-2 text-[10px] text-destructive">{sdkError}</p>}
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
