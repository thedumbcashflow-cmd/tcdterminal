import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Check, Lock, MessageSquarePlus, Loader2 } from "lucide-react";
import { useSubscriptionTier } from "@/hooks/useSubscriptionTier";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

type BillingPeriod = "monthly" | "quarterly" | "yearly";

const PRICING_CONFIG = {
  pro: {
    monthly: 199,
    quarterly: 549,
    yearly: 1999,
  },
  whale: {
    monthly: 799,
    quarterly: 2199,
    yearly: 7999,
  },
};

const PERIOD_LABELS: Record<BillingPeriod, string> = {
  monthly: "/mo",
  quarterly: "/qtr",
  yearly: "/yr",
};

const PERIOD_SAVINGS: Record<BillingPeriod, string> = {
  monthly: "",
  quarterly: "≈8% off",
  yearly: "≈16% off",
};

const PLANS = (period: BillingPeriod) => [
  {
    name: "FREE",
    price: 0,
    tier: "free" as const,
    tagline: "Teaser tier",
    features: [
      "Dashboard overview",
      "Basic whale flow monitor (delayed)",
      "Live price ticker",
      "Community support",
    ],
    locked: [
      "Full Whale Flows",
      "Liquidation Heatmap",
      "Data Room",
      "AI Market Briefs",
      "Network Health",
      "DePIN Tracker",
      "Alerts & Export",
    ],
    justification: null,
  },
  {
    name: "PRO",
    price: PRICING_CONFIG.pro[period],
    tier: "pro" as const,
    popular: true,
    tagline: "Operator tier",
    features: [
      "Full Whale Flows (real-time + historical)",
      "Liquidation Heatmap — full depth + cluster breakdown",
      "Network Health + DePIN Tracker dashboards",
      "AI Market Briefs (daily + on-demand)",
      "Data Room access",
      "Export (CSV) for whale flows + liquidations",
      "Priority support",
    ],
    locked: [
      "API access",
      "Advanced multi-condition alerts",
      "White-glove onboarding",
    ],
    justification: "Replaces hours/day of manual dashboard hopping. One terminal compresses signals. You're paying for real-time intelligence + time saved, not UI.",
  },
  {
    name: "WHALE",
    price: PRICING_CONFIG.whale[period],
    tier: "whale" as const,
    tagline: "Institutional tier",
    features: [
      "Everything in PRO",
      "Advanced alerts (multi-condition, webhook/email)",
      "API access (read-only endpoints)",
      "White-glove onboarding",
      "Priority support + direct analyst channel",
      "Higher rate limits",
    ],
    locked: [],
    justification: "Targets desks, funds & operators. One avoided bad trade pays the month. API + advanced alerts are the real institutional surface area.",
  },
];

const Pricing = React.forwardRef<HTMLDivElement>((_, ref) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const paymentStatus = searchParams.get("payment");
  const { tier: currentTier, isPro, isAdmin } = useSubscriptionTier();
  const { user } = useAuth();

  const initialPeriod = (searchParams.get("period") as BillingPeriod) || "monthly";
  const [period, setPeriod] = useState<BillingPeriod>(initialPeriod);

  // Feature request state
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [reqTitle, setReqTitle] = useState("");
  const [reqDesc, setReqDesc] = useState("");
  const [reqPriority, setReqPriority] = useState("low");
  const [reqSubmitting, setReqSubmitting] = useState(false);
  const [reqSuccess, setReqSuccess] = useState(false);

  const isPaidUser = isAdmin || isPro || currentTier === "whale";

  const handlePeriodChange = (p: BillingPeriod) => {
    setPeriod(p);
    setSearchParams({ period: p });
  };

  const handleUpgrade = (tier: string) => {
    if (!user) { navigate("/auth"); return; }
    if (tier === "free") return;
    navigate(`/checkout?plan=${tier}&period=${period}`);
  };

  const submitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !reqTitle.trim()) return;
    setReqSubmitting(true);
    const { error } = await supabase.from("feature_requests" as any).insert({
      user_id: user.id,
      title: reqTitle.trim(),
      description: reqDesc.trim() || null,
      priority: reqPriority,
    } as any);
    if (!error) {
      setReqSuccess(true);
      setReqTitle("");
      setReqDesc("");
      setTimeout(() => setReqSuccess(false), 3000);
    }
    setReqSubmitting(false);
    setShowRequestForm(false);
  };

  const plans = PLANS(period);

    return (
    <div ref={ref} className="min-h-screen bg-background p-4 md:p-6">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-6 text-center">
          <button
            onClick={() => navigate("/dashboard")}
            className="mb-3 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            ← Back to Terminal
          </button>
          <h1 className="font-serif text-2xl font-bold text-primary">◆ TCD Terminal Plans</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Institutional-grade Solana intelligence. Choose your access level.
          </p>
          {paymentStatus === "success" && (
            <div className="mt-3 inline-block border border-terminal-green bg-terminal-green/10 px-3 py-1.5 text-xs font-bold text-terminal-green">
              ✓ Payment successful! Your plan has been upgraded.
            </div>
          )}
        </div>

        {/* Billing Toggle */}
        <div className="flex justify-center mb-6">
          <div className="inline-flex border border-border bg-card">
            {(["monthly", "quarterly", "yearly"] as BillingPeriod[]).map((p) => (
              <button
                key={p}
                onClick={() => handlePeriodChange(p)}
                className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
                  period === p
                    ? "bg-primary/20 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {p}
                {PERIOD_SAVINGS[p] && (
                  <span className="ml-1 text-[9px] text-terminal-green">{PERIOD_SAVINGS[p]}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Plan Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {plans.map((plan) => {
            const isCurrent = plan.tier === currentTier;
            return (
              <div
                key={plan.tier}
                className={`border bg-card p-5 flex flex-col ${
                  plan.popular ? "border-primary" : "border-border"
                }`}
              >
                {plan.popular && (
                  <div className="mb-2 inline-block self-start border border-primary bg-primary/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-primary">
                    Most Popular
                  </div>
                )}
                <h2 className="font-serif text-lg font-bold text-foreground">{plan.name}</h2>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">{plan.tagline}</p>
                <div className="flex items-baseline gap-1">
                  {plan.price === 0 ? (
                    <span className="font-data text-3xl font-bold text-primary">$0</span>
                  ) : (
                    <>
                      <span className="font-data text-3xl font-bold text-primary">${plan.price.toLocaleString()}</span>
                      <span className="text-xs text-muted-foreground">{PERIOD_LABELS[period]}</span>
                    </>
                  )}
                </div>

                <div className="mt-4 flex-1 space-y-2">
                  {plan.features.map((f) => (
                    <div key={f} className="flex items-start gap-2 text-xs text-foreground">
                      <Check className="h-3 w-3 text-terminal-green flex-shrink-0 mt-0.5" />
                      {f}
                    </div>
                  ))}
                  {plan.locked.map((f) => (
                    <div key={f} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <Lock className="h-3 w-3 flex-shrink-0 mt-0.5" />
                      {f}
                    </div>
                  ))}
                </div>

                {plan.justification && (
                  <div className="mt-3 border-t border-border pt-3">
                    <p className="text-[10px] text-muted-foreground italic leading-relaxed">
                      {plan.justification}
                    </p>
                  </div>
                )}

                <button
                  onClick={() => handleUpgrade(plan.tier)}
                  disabled={isCurrent}
                  className={`mt-4 w-full border py-2.5 text-xs font-bold uppercase tracking-wider transition-colors ${
                    isCurrent
                      ? "border-border text-muted-foreground cursor-default"
                      : "border-primary bg-primary/10 text-primary hover:bg-primary/20"
                  }`}
                >
                  {isCurrent ? "CURRENT PLAN" : plan.tier === "free" ? "FREE TIER" : `UPGRADE — $${plan.price.toLocaleString()}${PERIOD_LABELS[period]}`}
                </button>
              </div>
            );
          })}
        </div>

        {/* Feature Request Section */}
        <div className="mt-8 border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">Request a Feature</h3>
            {isPaidUser ? (
              <button
                onClick={() => setShowRequestForm(!showRequestForm)}
                className="flex items-center gap-1 border border-primary bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-primary hover:bg-primary/20 transition-colors"
              >
                <MessageSquarePlus className="h-3 w-3" />
                {showRequestForm ? "Close" : "New Request"}
              </button>
            ) : (
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <Lock className="h-3 w-3" />
                <span>PRO or WHALE required</span>
                <button
                  onClick={() => handleUpgrade("pro")}
                  className="border border-primary bg-primary/10 px-2 py-0.5 text-[9px] font-bold uppercase text-primary hover:bg-primary/20 transition-colors"
                >
                  Upgrade
                </button>
              </div>
            )}
          </div>

          {reqSuccess && (
            <div className="mb-3 border border-terminal-green bg-terminal-green/10 px-3 py-1.5 text-xs text-terminal-green">
              ✓ Feature request submitted successfully!
            </div>
          )}

          {showRequestForm && isPaidUser && (
            <form onSubmit={submitRequest} className="space-y-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Title *</label>
                <input
                  value={reqTitle}
                  onChange={(e) => setReqTitle(e.target.value)}
                  required
                  maxLength={100}
                  className="mt-1 w-full border border-border bg-background px-2 py-1.5 text-xs font-data text-foreground"
                  placeholder="e.g., Add SOL staking analytics"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Description</label>
                <textarea
                  value={reqDesc}
                  onChange={(e) => setReqDesc(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  className="mt-1 w-full border border-border bg-background px-2 py-1.5 text-xs font-data text-foreground resize-none"
                  placeholder="Describe what you'd like to see..."
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Priority</label>
                <select
                  value={reqPriority}
                  onChange={(e) => setReqPriority(e.target.value)}
                  className="mt-1 w-full border border-border bg-background px-2 py-1.5 text-xs font-data text-foreground"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={reqSubmitting || !reqTitle.trim()}
                className="flex items-center gap-1 border border-primary bg-primary/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-primary hover:bg-primary/20 disabled:opacity-50 transition-colors"
              >
                {reqSubmitting ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                Submit Request
              </button>
            </form>
          )}
        </div>

        <div className="mt-6 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
            All plans include AES-256 encryption ◆ 99.9% uptime SLA ◆ Secure PayPal checkout
          </p>
        </div>
      </div>
    </div>
  );
});
Pricing.displayName = "Pricing";

export default Pricing;
