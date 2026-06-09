import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Lock, MessageSquarePlus, Loader2, Zap, Shield, X } from "lucide-react";
import { useSubscriptionTier } from "@/hooks/useSubscriptionTier";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

type BillingPeriod = "monthly" | "quarterly" | "yearly";

function getPrice(base: number, period: BillingPeriod): { display: string; sub: string } {
  if (period === "monthly") return { display: `$${base.toLocaleString()}`, sub: "/mo" };
  if (period === "quarterly") {
    const mo = Math.round(base * 0.9);
    return { display: `$${mo.toLocaleString()}`, sub: "/mo, billed quarterly" };
  }
  const mo = Math.round(base * 0.75);
  return { display: `$${mo.toLocaleString()}`, sub: "/mo, billed annually" };
}

function getAnnualTotal(base: number): { total: string; savings: string } {
  const yearly = Math.round(base * 12 * 0.75);
  const full = base * 12;
  const saved = full - yearly;
  return { total: `$${yearly.toLocaleString()}`, savings: `$${saved.toLocaleString()}` };
}

const Pricing = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const paymentStatus = searchParams.get("payment");
  const trialExpired = searchParams.get("trial") === "expired";
  const { tier: currentTier, isPro, isAdmin } = useSubscriptionTier();
  const { user } = useAuth();

  const initialPeriod = (searchParams.get("period") as BillingPeriod) || "monthly";
  const [period, setPeriod] = useState<BillingPeriod>(initialPeriod);

  // Feature request form
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [reqTitle, setReqTitle] = useState("");
  const [reqDesc, setReqDesc] = useState("");
  const [reqPriority, setReqPriority] = useState("low");
  const [reqSubmitting, setReqSubmitting] = useState(false);
  const [reqSuccess, setReqSuccess] = useState(false);

  // Sovereign apply modal
  const [showSovereign, setShowSovereign] = useState(false);
  const [sovName, setSovName] = useState("");
  const [sovFund, setSovFund] = useState("");
  const [sovAum, setSovAum] = useState("$50M – $250M");
  const [sovEmail, setSovEmail] = useState(user?.email ?? "");
  const [sovMessage, setSovMessage] = useState("");
  const [sovSubmitting, setSovSubmitting] = useState(false);
  const [sovSuccess, setSovSuccess] = useState(false);
  const [sovError, setSovError] = useState<string | null>(null);

  const isPaidUser = isAdmin || isPro || currentTier === "whale";

  const handlePeriodChange = (p: BillingPeriod) => {
    setPeriod(p);
    setSearchParams({ period: p });
  };

  const handleUpgrade = (tier: string) => {
    if (!user) {
      navigate("/auth");
      return;
    }
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

  const openSovereign = () => {
    if (!user) {
      navigate("/auth");
      return;
    }
    setSovEmail(user.email ?? "");
    setSovError(null);
    setSovSuccess(false);
    setShowSovereign(true);
  };

  const submitSovereign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSovError(null);
    if (!sovName.trim() || !sovFund.trim() || !sovEmail.trim()) {
      setSovError("Name, fund, and contact email are required.");
      return;
    }
    setSovSubmitting(true);
    const { error } = await supabase.from("sovereign_applications" as any).insert({
      user_id: user.id,
      applicant_name: sovName.trim().slice(0, 200),
      fund_name: sovFund.trim().slice(0, 200),
      aum_bracket: sovAum,
      contact_email: sovEmail.trim().slice(0, 255),
      message: sovMessage.trim().slice(0, 2000) || null,
    } as any);
    setSovSubmitting(false);
    if (error) {
      setSovError(error.message || "Submission failed. Please try again.");
      return;
    }
    setSovSuccess(true);
    setSovName("");
    setSovFund("");
    setSovMessage("");
    setTimeout(() => setShowSovereign(false), 2500);
  };

  const proPrice = getPrice(499, period);
  const whalePrice = getPrice(2499, period);
  const proAnnual = getAnnualTotal(499);
  const whaleAnnual = getAnnualTotal(2499);

  const periods: { key: BillingPeriod; label: string; badge?: string }[] = [
    { key: "monthly", label: "Monthly" },
    { key: "quarterly", label: "Quarterly", badge: "≈10% off" },
    { key: "yearly", label: "Yearly", badge: "≈25% off" },
  ];

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-6 text-center">
          <button
            onClick={() => navigate("/dashboard")}
            className="mb-3 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            ← Back to Terminal
          </button>
          <h1 className="font-serif text-2xl md:text-3xl font-bold text-primary">
            ◆ TCD Terminal Plans: Sovereign Solana Intelligence
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Three tiers. Operator desk to sovereign deployment.
          </p>
          {paymentStatus === "success" && (
            <div className="mt-3 inline-block border border-terminal-green bg-terminal-green/10 px-3 py-1.5 text-xs font-bold text-terminal-green">
              ✓ Payment successful! Your plan has been upgraded.
            </div>
          )}
          {trialExpired && (
            <div className="mt-3 inline-block border border-destructive bg-destructive/10 px-3 py-1.5 text-xs font-bold text-destructive">
              Your 7-day trial has ended. Upgrade to keep your access.
            </div>
          )}
        </div>

        {/* Trial Banner */}
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl px-6 py-4 flex flex-col sm:flex-row items-center justify-between max-w-5xl mx-auto mb-8 gap-4">
          <div>
            <h3 className="font-semibold text-sm text-zinc-50">
              Start with a 7-day free trial
            </h3>
            <p className="font-mono text-xs text-zinc-400 mt-1">
              Full Professional access. No credit card required. Expires automatically — no surprise charges.
            </p>
          </div>
          <button
            onClick={() => navigate("/auth")}
            className="bg-green-500 text-black hover:bg-green-400 font-mono text-sm px-5 py-2 rounded-md whitespace-nowrap transition-colors"
          >
            Start 7-Day Trial →
          </button>
        </div>

        {/* Billing Toggle */}
        <div className="flex justify-center mb-6">
          <div className="inline-flex border border-zinc-700 rounded-lg overflow-hidden">
            {periods.map((p) => (
              <button
                key={p.key}
                onClick={() => handlePeriodChange(p.key)}
                className={`px-4 py-2 font-mono text-xs transition-colors ${
                  period === p.key
                    ? "bg-zinc-800 text-zinc-50"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {p.label}
                {p.badge && (
                  <span className="text-[10px] text-green-400 ml-1">{p.badge}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Plan Cards — 3 columns */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
          {/* PROFESSIONAL Card */}
          <div className="border border-zinc-700 bg-card rounded-lg p-5 flex flex-col">
            <span className="font-mono text-xs text-zinc-400 tracking-widest">PROFESSIONAL</span>
            <p className="text-xs text-zinc-500 mt-0.5">For individual high-frequency operators.</p>
            <div className="flex items-baseline gap-1 mt-3">
              <span className="font-mono text-3xl font-bold text-foreground">{proPrice.display}</span>
              <span className="text-xs text-zinc-400">{proPrice.sub}</span>
            </div>
            {period === "yearly" && (
              <p className="text-xs text-zinc-500 font-mono mt-1">
                Billed as {proAnnual.total}/yr — save {proAnnual.savings}
              </p>
            )}

            <div className="mt-4 flex-1 space-y-2">
              {[
                "Full Whale Flows (real-time + historical)",
                "Liquidation Heatmap — full depth",
                "Network Health + DePIN Tracker",
                "AI Market Briefs (daily + on-demand)",
                "Data Room access",
                "CSV Export",
              ].map((f) => (
                <div key={f} className="flex items-start gap-2 text-xs text-zinc-300">
                  <Zap className="h-3 w-3 text-green-500 flex-shrink-0 mt-0.5" />
                  {f}
                </div>
              ))}
            </div>

            <button
              onClick={() => (user ? handleUpgrade("pro") : navigate("/auth"))}
              disabled={currentTier === "pro"}
              className={`w-full mt-6 py-2.5 font-mono text-xs rounded transition-colors ${
                currentTier === "pro"
                  ? "border border-zinc-700 text-zinc-500 cursor-default"
                  : "bg-zinc-100 text-black hover:bg-zinc-200"
              }`}
            >
              {currentTier === "pro" ? "CURRENT PLAN" : "Start 7-Day Trial"}
            </button>
            {currentTier !== "pro" && (
              <p className="font-mono text-[10px] text-zinc-500 text-center mt-2">
                7 days free, then {getPrice(499, "monthly").display}/mo. Cancel anytime.
              </p>
            )}
          </div>

          {/* INSTITUTIONAL (Whale) Card */}
          <div className="relative border border-green-500/40 bg-card rounded-lg p-5 flex flex-col">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 font-mono text-[9px] px-3 py-0.5 whitespace-nowrap">
              INSTITUTIONAL
            </span>
            <span className="font-mono text-xs text-green-400 tracking-widest mt-1">WHALE</span>
            <p className="text-xs text-zinc-500 mt-0.5">For mid-sized funds and family offices.</p>
            <div className="flex items-baseline gap-1 mt-3">
              <span className="font-mono text-3xl font-bold text-foreground">{whalePrice.display}</span>
              <span className="text-xs text-zinc-400">{whalePrice.sub}</span>
            </div>
            {period === "yearly" && (
              <p className="text-xs text-zinc-500 font-mono mt-1">
                Billed as {whaleAnnual.total}/yr — save {whaleAnnual.savings}
              </p>
            )}

            <div className="mt-4 flex-1 space-y-2">
              {[
                "Everything in Professional",
                "API Write Access",
                "Multi-condition Alerts (Webhook / Email)",
                "Direct Analyst Channel",
                "Higher Rate Limits",
                "White-glove onboarding",
              ].map((f) => (
                <div key={f} className="flex items-start gap-2 text-xs text-zinc-300">
                  <Zap className="h-3 w-3 text-green-500 flex-shrink-0 mt-0.5" />
                  {f}
                </div>
              ))}
            </div>

            <button
              onClick={() => handleUpgrade("whale")}
              disabled={currentTier === "whale"}
              className={`w-full mt-6 py-2.5 font-mono text-xs rounded transition-colors ${
                currentTier === "whale"
                  ? "border border-zinc-700 text-zinc-500 cursor-default"
                  : "bg-green-500 text-black hover:bg-green-400"
              }`}
            >
              {currentTier === "whale" ? "CURRENT PLAN" : "Start Institutional Trial"}
            </button>
          </div>

          {/* SOVEREIGN TITAN Card */}
          <div
            className="relative border-2 rounded-lg p-5 flex flex-col bg-card"
            style={{
              borderColor: "#0068ff",
              boxShadow: "0 0 24px rgba(0, 104, 255, 0.35), inset 0 0 16px rgba(0, 104, 255, 0.06)",
            }}
          >
            <span
              className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full font-mono text-[9px] px-3 py-0.5 whitespace-nowrap flex items-center gap-1"
              style={{
                background: "rgba(0, 104, 255, 0.12)",
                color: "#7fb6ff",
                border: "1px solid rgba(0, 104, 255, 0.6)",
              }}
            >
              <Shield className="h-2.5 w-2.5" />
              SOVEREIGN INTELLIGENCE
            </span>
            <span className="font-mono text-xs tracking-widest mt-1" style={{ color: "#7fb6ff" }}>
              SOVEREIGN TITAN
            </span>
            <p className="text-xs text-zinc-500 mt-0.5">For Institutional Giants &amp; Sovereign Alpha.</p>
            <div className="flex items-baseline gap-1 mt-3">
              <span className="font-mono text-3xl font-bold text-foreground">$100,000</span>
              <span className="text-xs text-zinc-400">/ year</span>
            </div>
            <p className="text-xs text-zinc-500 font-mono mt-1">Application required.</p>

            <div className="mt-4 flex-1 space-y-2">
              {[
                "Everything in Institutional",
                "Local-First Deployment (no data leakage)",
                "Private TCD Instance",
                "Custom Proprietary Alpha Pipelines",
                "Escrow-Backed Performance Guarantees",
                "24/7 White-Glove Support",
              ].map((f) => (
                <div key={f} className="flex items-start gap-2 text-xs text-zinc-300">
                  <Shield className="h-3 w-3 flex-shrink-0 mt-0.5" style={{ color: "#7fb6ff" }} />
                  {f}
                </div>
              ))}
            </div>

            <button
              onClick={openSovereign}
              className="w-full mt-6 py-3 font-mono text-xs font-bold uppercase tracking-widest rounded transition-all"
              style={{
                background: "linear-gradient(135deg, #0068ff 0%, #0046b0 100%)",
                color: "#ffffff",
                boxShadow: "0 0 18px rgba(0, 104, 255, 0.5)",
                border: "1px solid #0068ff",
              }}
            >
              ◆ Apply for Sovereign License
            </button>
            <p className="font-mono text-[10px] text-zinc-500 text-center mt-2">
              Reviewed within 48 hours by the analyst desk.
            </p>
          </div>
        </div>

        {/* Sovereign footer note */}
        <div className="mt-6 max-w-5xl mx-auto text-center">
          <p
            className="font-mono text-[11px] uppercase tracking-widest"
            style={{ color: "#7fb6ff" }}
          >
            ◆ Institutional licenses require a 10 SOL security deposit via Solana Pay Escrow for trial activation.
          </p>
        </div>

        {/* Feature Request Section */}
        <div className="mt-8 border border-border bg-card p-5 max-w-5xl mx-auto rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
              Request a Feature
            </h3>
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
                <span>Professional or Institutional required</span>
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
                  className="mt-1 w-full border border-border bg-background px-2 py-1.5 text-xs font-mono text-foreground rounded"
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
                  className="mt-1 w-full border border-border bg-background px-2 py-1.5 text-xs font-mono text-foreground resize-none rounded"
                  placeholder="Describe what you'd like to see..."
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Priority</label>
                <select
                  value={reqPriority}
                  onChange={(e) => setReqPriority(e.target.value)}
                  className="mt-1 w-full border border-border bg-background px-2 py-1.5 text-xs font-mono text-foreground rounded"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={reqSubmitting || !reqTitle.trim()}
                className="flex items-center gap-1 border border-primary bg-primary/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-primary hover:bg-primary/20 disabled:opacity-50 transition-colors rounded"
              >
                {reqSubmitting && <Loader2 className="h-3 w-3 animate-spin" />}
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

      {/* Sovereign Application Modal */}
      {showSovereign && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0, 0, 0, 0.75)", backdropFilter: "blur(4px)" }}
          onClick={() => !sovSubmitting && setShowSovereign(false)}
        >
          <div
            className="relative w-full max-w-lg bg-card border-2 rounded-lg p-6"
            style={{ borderColor: "#0068ff", boxShadow: "0 0 36px rgba(0, 104, 255, 0.4)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowSovereign(false)}
              disabled={sovSubmitting}
              className="absolute top-3 right-3 text-zinc-400 hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-2 mb-1">
              <Shield className="h-4 w-4" style={{ color: "#7fb6ff" }} />
              <h2 className="font-serif text-lg font-bold text-foreground">
                Apply for Sovereign License
              </h2>
            </div>
            <p className="text-xs text-zinc-400 mb-4">
              The analyst desk reviews every application within 48 hours.
            </p>

            {sovSuccess ? (
              <div className="border border-terminal-green bg-terminal-green/10 px-3 py-3 text-xs text-terminal-green">
                ✓ Application received. We'll be in touch at <strong>{sovEmail}</strong>.
              </div>
            ) : (
              <form onSubmit={submitSovereign} className="space-y-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Full name *</label>
                  <input
                    value={sovName}
                    onChange={(e) => setSovName(e.target.value)}
                    required
                    maxLength={200}
                    className="mt-1 w-full border border-border bg-background px-2 py-1.5 text-xs font-mono text-foreground rounded"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Fund / firm *</label>
                  <input
                    value={sovFund}
                    onChange={(e) => setSovFund(e.target.value)}
                    required
                    maxLength={200}
                    className="mt-1 w-full border border-border bg-background px-2 py-1.5 text-xs font-mono text-foreground rounded"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">AUM</label>
                    <select
                      value={sovAum}
                      onChange={(e) => setSovAum(e.target.value)}
                      className="mt-1 w-full border border-border bg-background px-2 py-1.5 text-xs font-mono text-foreground rounded"
                    >
                      <option>$50M – $250M</option>
                      <option>$250M – $1B</option>
                      <option>$1B – $5B</option>
                      <option>$5B+</option>
                      <option>Sovereign / Treasury</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Contact email *</label>
                    <input
                      type="email"
                      value={sovEmail}
                      onChange={(e) => setSovEmail(e.target.value)}
                      required
                      maxLength={255}
                      className="mt-1 w-full border border-border bg-background px-2 py-1.5 text-xs font-mono text-foreground rounded"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Message</label>
                  <textarea
                    value={sovMessage}
                    onChange={(e) => setSovMessage(e.target.value)}
                    rows={3}
                    maxLength={2000}
                    className="mt-1 w-full border border-border bg-background px-2 py-1.5 text-xs font-mono text-foreground resize-none rounded"
                    placeholder="Use-case, deployment requirements, timeline…"
                  />
                </div>

                {sovError && (
                  <div className="border border-destructive bg-destructive/10 px-3 py-1.5 text-[11px] text-destructive">
                    {sovError}
                  </div>
                )}

                <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "#7fb6ff" }}>
                  ◆ Trial activation requires a 10 SOL security deposit via Solana Pay Escrow.
                </p>

                <button
                  type="submit"
                  disabled={sovSubmitting}
                  className="w-full py-3 font-mono text-xs font-bold uppercase tracking-widest rounded transition-all disabled:opacity-60"
                  style={{
                    background: "linear-gradient(135deg, #0068ff 0%, #0046b0 100%)",
                    color: "#ffffff",
                    boxShadow: "0 0 18px rgba(0, 104, 255, 0.5)",
                    border: "1px solid #0068ff",
                  }}
                >
                  {sovSubmitting && <Loader2 className="inline h-3 w-3 mr-2 animate-spin" />}
                  Submit Application
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Pricing;
