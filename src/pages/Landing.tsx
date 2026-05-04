import { useNavigate } from "react-router-dom";
import { Activity, Waves, Globe, Zap, ArrowRight, Shield } from "lucide-react";

const Landing = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="border-b border-border px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-serif text-lg font-bold text-primary">◆ TCD</span>
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground hidden sm:inline">
            Token Catalyst Deck
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/auth")}
            className="text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            Sign In
          </button>
          <button
            onClick={() => navigate("/pricing")}
            className="border border-primary bg-primary/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-primary hover:bg-primary/20 transition-colors"
          >
            View Pricing
          </button>
        </div>
      </header>

      <main>
      {/* Hero */}
      <section className="px-6 py-16 md:py-24 text-center max-w-3xl mx-auto">
        <div className="inline-block border border-primary/30 bg-primary/5 px-3 py-1 text-[10px] uppercase tracking-widest text-primary mb-6">
          Institutional-grade Solana intelligence
        </div>
        <h1 className="font-serif text-3xl md:text-5xl font-bold leading-tight text-foreground">
          Stop dashboard hopping.{" "}
          <span className="text-primary">Start seeing the signal.</span>
        </h1>
        <p className="mt-4 text-sm md:text-base text-muted-foreground max-w-xl mx-auto leading-relaxed">
          TCD compresses whale flows, liquidation regimes, network health, and macro context
          into one terminal — so you react faster, with more clarity and less noise.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={() => navigate("/auth")}
            className="border border-primary bg-primary/10 px-6 py-3 text-xs font-bold uppercase tracking-wider text-primary hover:bg-primary/20 transition-colors flex items-center gap-2"
          >
            Start Free Trial <ArrowRight className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => navigate("/pricing")}
            className="border border-border px-6 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-colors"
          >
            View Plans
          </button>
        </div>
      </section>

      {/* Benefits */}
      <section className="border-t border-border px-6 py-16 md:py-20">
        <div className="max-w-4xl mx-auto">
          <h2 className="font-serif text-xl md:text-2xl font-bold text-center text-foreground mb-10">
            Why operators choose TCD
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              {
                icon: <Waves className="h-5 w-5 text-primary" />,
                title: "Compress the signal",
                desc: "One terminal replaces six dashboards. Whale flows, liquidations, network health — unified with context, not noise.",
              },
              {
                icon: <Zap className="h-5 w-5 text-primary" />,
                title: "React faster to regime shifts",
                desc: "See whale accumulation and liquidation clusters before price reacts. Real-time data, not delayed feeds.",
              },
              {
                icon: <Activity className="h-5 w-5 text-primary" />,
                title: "Know network health first",
                desc: "TPS drops, validator issues, epoch transitions — monitor Solana infrastructure before it hits your positions.",
              },
              {
                icon: <Globe className="h-5 w-5 text-primary" />,
                title: "Macro overlay explains 'why now'",
                desc: "Fear & Greed, DXY proxy, BTC dominance — global context that explains Solana price action.",
              },
            ].map((b, i) => (
              <div key={i} className="border border-border bg-card p-5">
                <div className="mb-3">{b.icon}</div>
                <h3 className="font-serif text-sm font-bold text-foreground mb-1">{b.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Capabilities (minimal) */}
      <section className="border-t border-border px-6 py-16">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="font-serif text-xl font-bold text-foreground mb-8">Core capabilities</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Whale Flow Monitor", sub: "Real-time + historical" },
              { label: "Liquidation Heatmap", sub: "Full depth clusters" },
              { label: "Network Health", sub: "TPS, validators, epochs" },
              { label: "AI Market Briefs", sub: "Daily intelligence" },
            ].map((c, i) => (
              <div key={i} className="border border-border bg-card/50 p-4">
                <div className="text-xs font-bold uppercase tracking-wider text-foreground">{c.label}</div>
                <div className="mt-1 text-[10px] text-muted-foreground">{c.sub}</div>
              </div>
            ))}
          </div>
          <button
            onClick={() => navigate("/pricing")}
            className="mt-8 border border-primary bg-primary/10 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-primary hover:bg-primary/20 transition-colors inline-flex items-center gap-2"
          >
            See all features <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </section>

      {/* Social Proof */}
      <section className="border-t border-border px-6 py-12">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Trusted by</p>
          <p className="font-serif text-sm text-muted-foreground italic">
            "Used by operators, analysts, and desk-adjacent teams who need Solana intelligence without the noise."
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border px-6 py-16 text-center">
        <h2 className="font-serif text-xl md:text-2xl font-bold text-foreground mb-3">
          Ready to see the signal?
        </h2>
        <p className="text-xs text-muted-foreground mb-6">Start with a free trial. No credit card required.</p>
        <button
          onClick={() => navigate("/auth")}
          className="border border-primary bg-primary/10 px-8 py-3 text-xs font-bold uppercase tracking-wider text-primary hover:bg-primary/20 transition-colors"
        >
          Get Started
        </button>
      </section>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Shield className="h-3 w-3 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground">AES-256 encrypted ◆ 99.9% uptime SLA</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/pricing")} className="text-[10px] text-muted-foreground hover:text-primary transition-colors">Pricing</button>
          <a href="https://github.com/AviMehta90/World-Monitor" target="_blank" rel="noopener noreferrer" className="text-[10px] text-muted-foreground hover:text-primary transition-colors">
            Open Source Notices
          </a>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
