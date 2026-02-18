import { useNavigate, useSearchParams } from "react-router-dom";
import { Check, Lock } from "lucide-react";
import { useSubscriptionTier } from "@/hooks/useSubscriptionTier";

const PLANS = [
  {
    name: "FREE",
    price: "$0",
    period: "forever",
    tier: "free" as const,
    features: [
      "Dashboard overview",
      "Basic whale flow monitor",
      "Live price ticker",
      "Network health stats",
      "Community support",
    ],
    locked: [
      "Liquidation heatmap",
      "Data Room access",
      "AI market analysis",
      "Premium whale flows",
      "Export & API access",
    ],
  },
  {
    name: "PRO",
    price: "$49",
    period: "/month",
    tier: "pro" as const,
    popular: true,
    features: [
      "Everything in Free",
      "Liquidation heatmap",
      "Data Room access",
      "AI market analysis",
      "Premium whale flows",
      "Priority support",
    ],
    locked: ["Export & API access", "White-glove onboarding"],
  },
  {
    name: "WHALE",
    price: "$199",
    period: "/month",
    tier: "whale" as const,
    features: [
      "Everything in Pro",
      "Export & API access",
      "White-glove onboarding",
      "Custom alerts",
      "Direct analyst access",
      "Institutional data feeds",
    ],
    locked: [],
  },
];

const Pricing = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("return") || "/";
  const { tier: currentTier } = useSubscriptionTier();

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <button
            onClick={() => navigate("/")}
            className="mb-4 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            ← Back to Terminal
          </button>
          <h1 className="font-serif text-2xl font-bold text-primary">◆ TCD Terminal Plans</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Institutional-grade Solana intelligence. Choose your access level.
          </p>
        </div>

        {/* Plan Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {PLANS.map((plan) => {
            const isCurrent = plan.tier === currentTier;
            return (
              <div
                key={plan.tier}
                className={`border bg-card p-5 flex flex-col ${
                  plan.popular ? "border-primary" : "border-border"
                }`}
              >
                {plan.popular && (
                  <div className="mb-3 inline-block self-start border border-primary bg-primary/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-primary">
                    Most Popular
                  </div>
                )}
                <h2 className="font-serif text-lg font-bold text-foreground">{plan.name}</h2>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="font-data text-3xl font-bold text-primary">{plan.price}</span>
                  <span className="text-xs text-muted-foreground">{plan.period}</span>
                </div>

                <div className="mt-4 flex-1 space-y-2">
                  {plan.features.map((f) => (
                    <div key={f} className="flex items-center gap-2 text-xs text-foreground">
                      <Check className="h-3 w-3 text-terminal-green flex-shrink-0" />
                      {f}
                    </div>
                  ))}
                  {plan.locked.map((f) => (
                    <div key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Lock className="h-3 w-3 flex-shrink-0" />
                      {f}
                    </div>
                  ))}
                </div>

                <button
                  disabled={isCurrent}
                  className={`mt-5 w-full border py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
                    isCurrent
                      ? "border-border text-muted-foreground cursor-default"
                      : "border-primary bg-primary/10 text-primary hover:bg-primary/20"
                  }`}
                >
                  {isCurrent ? "CURRENT PLAN" : plan.tier === "free" ? "DOWNGRADE" : "UPGRADE"}
                </button>
              </div>
            );
          })}
        </div>

        <div className="mt-6 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
            All plans include AES-256 encryption ◆ 99.9% uptime SLA ◆ SOC2 compliant
          </p>
        </div>
      </div>
    </div>
  );
};

export default Pricing;
