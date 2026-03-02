import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CreditCard, ArrowLeft } from "lucide-react";

const PLAN_DETAILS: Record<string, { name: string; price: string; priceNum: number }> = {
  pro: { name: "PRO", price: "$49/mo", priceNum: 49 },
  whale: { name: "WHALE", price: "$199/mo", priceNum: 199 },
};

const Checkout = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const plan = searchParams.get("plan") || "pro";
  const period = searchParams.get("period") || "monthly";
  const details = PLAN_DETAILS[plan];

  const [loadingPaystack, setLoadingPaystack] = useState(false);
  const [loadingPaypal, setLoadingPaypal] = useState(false);
  const [paypalReady, setPaypalReady] = useState(false);
  const [paypalError, setPaypalError] = useState<string | null>(null);
  const [paystackError, setPaystackError] = useState<string | null>(null);

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

        // Load PayPal SDK script
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

  const handlePaystack = async () => {
    if (!user) return;
    setLoadingPaystack(true);
    setPaystackError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionData.session?.access_token}`,
          },
          body: JSON.stringify({ plan, provider: "paystack" }),
        }
      );
      const data = await resp.json();
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
      } else {
        setPaystackError(data.error || "Failed to create checkout");
      }
    } catch (e) {
      setPaystackError(e instanceof Error ? e.message : "Checkout failed");
    }
    setLoadingPaystack(false);
  };

  const handlePaypal = async () => {
    if (!paypalReady || !(window as any).paypal) {
      setPaypalError("PayPal SDK not loaded yet");
      return;
    }
    setLoadingPaypal(true);
    try {
      const pp = (window as any).paypal;
      const instance = await pp.createInstance({
        components: ["paypal-payments"],
        pageType: "checkout",
      });
      const methods = await instance.findEligibleMethods({ currencyCode: "USD" });
      if (methods?.paypalPayments?.isEligible) {
        // Start PayPal payment session
        const paypalPayments = methods.paypalPayments;
        await paypalPayments.start({
          createOrder: () => {
            // In production, this would call a server endpoint
            return Promise.resolve("SANDBOX_ORDER_ID");
          },
        });
      } else {
        setPaypalError("PayPal not eligible for this transaction");
      }
    } catch (e) {
      setPaypalError(e instanceof Error ? e.message : "PayPal error");
    }
    setLoadingPaypal(false);
  };

  if (!details) {
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
        <button onClick={() => navigate("/pricing")} className="mb-4 flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
          <ArrowLeft className="h-3 w-3" /> Back to Pricing
        </button>

        <h1 className="font-serif text-xl font-bold text-primary mb-1">◆ Checkout</h1>
        <p className="text-xs text-muted-foreground mb-6">Complete your {details.name} subscription</p>

        {/* Order Summary */}
        <div className="border border-border bg-card p-4 mb-4">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Order Summary</h2>
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-foreground">{details.name} Plan ({period})</span>
            <span className="font-data text-lg font-bold text-primary">{details.price}</span>
          </div>
        </div>

        {/* Paystack */}
        <div className="border border-border bg-card p-4 mb-3">
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Pay with Card / EFT</h3>
          <button
            onClick={handlePaystack}
            disabled={loadingPaystack}
            className="w-full flex items-center justify-center gap-2 border border-primary bg-primary/10 py-2.5 text-xs font-bold uppercase tracking-wider text-primary hover:bg-primary/20 disabled:opacity-50 transition-colors"
          >
            {loadingPaystack ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />}
            {loadingPaystack ? "Processing..." : "Pay with Paystack"}
          </button>
          {paystackError && <p className="mt-2 text-[10px] text-destructive">{paystackError}</p>}
        </div>

        {/* PayPal */}
        <div className="border border-border bg-card p-4">
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Pay with PayPal</h3>
          <button
            onClick={handlePaypal}
            disabled={loadingPaypal || !paypalReady}
            className="w-full flex items-center justify-center gap-2 border border-accent bg-accent/10 py-2.5 text-xs font-bold uppercase tracking-wider text-accent hover:bg-accent/20 disabled:opacity-50 transition-colors"
          >
            {loadingPaypal ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {!paypalReady ? "Loading PayPal..." : loadingPaypal ? "Processing..." : "Pay with PayPal"}
          </button>
          {paypalError && <p className="mt-2 text-[10px] text-destructive">{paypalError}</p>}
        </div>

        <p className="mt-4 text-center text-[10px] text-muted-foreground">
          AES-256 encrypted ◆ Secure checkout ◆ Cancel anytime
        </p>
      </div>
    </div>
  );
};

export default Checkout;
