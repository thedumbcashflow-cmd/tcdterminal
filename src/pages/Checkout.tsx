import { useState, useEffect } from "react";
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

const Checkout = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const plan = searchParams.get("plan") || "pro";
  const period = (searchParams.get("period") as BillingPeriod) || "monthly";
  const prices = PRICING[plan];
  const amount = prices?.[period];

  const [loadingPaypal, setLoadingPaypal] = useState(false);
  const [paypalReady, setPaypalReady] = useState(false);
  const [paypalError, setPaypalError] = useState<string | null>(null);
  const [orderCreated, setOrderCreated] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  // Load PayPal SDK
  useEffect(() => {
    const loadPaypal = async () => {
      try {
        const resp = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/paypal-client-token`,
          {
            headers: {
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
          }
        );
        if (!resp.ok) throw new Error("Failed to get PayPal token");
        const { accessToken } = await resp.json();

        const script = document.createElement("script");
        script.src = "https://www.sandbox.paypal.com/web-sdk/v6/core";
        script.setAttribute("data-client-token", accessToken);
        script.onload = () => setPaypalReady(true);
        script.onerror = () => setPaypalError("Failed to load PayPal SDK");
        document.head.appendChild(script);
      } catch (e) {
        setPaypalError(e instanceof Error ? e.message : "PayPal unavailable");
      }
    };
    loadPaypal();
  }, []);

  const handlePaypal = async () => {
    if (!user || !paypalReady) return;
    setLoadingPaypal(true);
    setPaypalError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      
      // Create order server-side
      const createResp = await fetch(
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
      const createData = await createResp.json();
      if (createData.error) throw new Error(createData.error);

      const orderId = createData.order_id;

      // Try PayPal SDK overlay
      const pp = (window as any).paypal;
      if (pp?.createInstance) {
        const instance = await pp.createInstance({
          components: ["paypal-payments"],
          pageType: "checkout",
        });
        const methods = await instance.findEligibleMethods({ currencyCode: "USD" });
        if (methods?.paypalPayments?.isEligible) {
          await methods.paypalPayments.start({
            createOrder: () => Promise.resolve(orderId),
            onApprove: async () => {
              // Capture server-side
              const captureResp = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/payment-webhook`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${sessionData.session?.access_token}`,
                  },
                  body: JSON.stringify({ event: "paypal.capture", order_id: orderId, plan, period }),
                }
              );
              const captureData = await captureResp.json();
              if (captureData.success) {
                setOrderCreated(true);
                navigate(`/pricing?payment=success&plan=${plan}`);
              } else {
                setPaypalError("Payment capture failed");
              }
            },
          });
          setLoadingPaypal(false);
          return;
        }
      }

      // Fallback: redirect to PayPal approval URL if SDK doesn't work
      if (createData.approval_url) {
        window.location.href = createData.approval_url;
        return;
      }

      setPaypalError("PayPal SDK not eligible. Please try again.");
    } catch (e) {
      setPaypalError(e instanceof Error ? e.message : "PayPal error");
    }
    setLoadingPaypal(false);
  };

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
            <span className="font-data text-lg font-bold text-primary">${amount.toLocaleString()}</span>
          </div>
        </div>

        {/* PayPal */}
        <div className="border border-border bg-card p-4">
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Pay with PayPal</h3>
          <button
            onClick={handlePaypal}
            disabled={loadingPaypal || !paypalReady}
            className="w-full flex items-center justify-center gap-2 border border-primary bg-primary/10 py-3 text-xs font-bold uppercase tracking-wider text-primary hover:bg-primary/20 disabled:opacity-50 transition-colors"
          >
            {loadingPaypal ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {!paypalReady ? "Loading PayPal..." : loadingPaypal ? "Processing..." : `Pay $${amount.toLocaleString()} with PayPal`}
          </button>
          {paypalError && <p className="mt-2 text-[10px] text-destructive">{paypalError}</p>}
        </div>

        <p className="mt-4 text-center text-[10px] text-muted-foreground">
          AES-256 encrypted ◆ Secure PayPal checkout ◆ Cancel anytime
        </p>
      </div>
    </div>
  );
};

export default Checkout;
