import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw, Play, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import TopBar from "@/components/TopBar";
import TerminalSidebar from "@/components/TerminalSidebar";
import TerminalCard from "@/components/TerminalCard";
import LiveTicker from "@/components/LiveTicker";

type ModelKey = "rdcf" | "comps" | "3stmt" | "lbo" | "risk" | "ma" | "mc";

const MODELS: { key: ModelKey; label: string }[] = [
  { key: "rdcf",  label: "Reverse DCF" },
  { key: "comps", label: "Comps" },
  { key: "3stmt", label: "3-Statement" },
  { key: "lbo",   label: "LBO" },
  { key: "risk",  label: "Portfolio Risk" },
  { key: "ma",    label: "M&A Accretion" },
  { key: "mc",    label: "Monte Carlo" },
];

// ---------- defaults per model ----------
const DEFAULTS: Record<ModelKey, Record<string, number>> = {
  rdcf:  { price: 180, revenue: 95000, netMargin: 22, wacc: 9, terminalGrowth: 3, growthCeiling: 15 },
  comps: { p25: 8, median: 12, p75: 16, ebitda: 5000 },
  "3stmt": { revenue: 10000, cogsPct: 55, opexPct: 25, capex: 800, depreciation: 500 },
  lbo:   { entryEv: 1000, ebitda: 100, debtPct: 60, interestRate: 8, ebitdaGrowth: 8, exitMultiple: 10, years: 5 },
  risk:  { retA: 12, volA: 18, retB: 8, volB: 10, corr: 0.3 },
  ma:    { acquirerEps: 5, targetNi: 200, sharesIssued: 30, synergies: 50, acquirerShares: 100 },
  mc:    { baseIrr: 18, stdDev: 12, simulations: 5000 },
};

// ---------- formatting ----------
const fmtPct = (n: number, d = 2) => (isFinite(n) ? `${n.toFixed(d)}%` : "—");
const fmtX   = (n: number, d = 2) => (isFinite(n) ? `${n.toFixed(d)}x` : "—");
const fmtNum = (n: number, d = 2) => (isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: d }) : "—");
const fmtUsd = (n: number) => {
  if (!isFinite(n)) return "—";
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
};

const FinancialModels = () => {
  const navigate = useNavigate();
  const [active, setActive] = useState<ModelKey>("rdcf");
  const [inputs, setInputs] = useState<Record<ModelKey, Record<string, number>>>(DEFAULTS);
  const [mcResult, setMcResult] = useState<{ p10: number; p50: number; p90: number; bins: number[]; binEdges: number[]; elapsedMs?: number } | null>(null);
  const [mcRunning, setMcRunning] = useState(false);
  const [mcError, setMcError] = useState<string | null>(null);

  const v = inputs[active];
  const setV = (k: string, val: number) => setInputs((s) => ({ ...s, [active]: { ...s[active], [k]: val } }));
  const reset = () => setInputs(DEFAULTS);

  // ---------- live calcs ----------
  const calcs = useMemo(() => {
    const r: Record<string, any> = {};
    // Reverse DCF — solve for growth that justifies current price (Gordon-style perpetuity on FCF)
    {
      const i = inputs.rdcf;
      const fcf = (i.revenue * (i.netMargin / 100));
      const sharesAssumed = 1000; // normalized
      const mcap = i.price * sharesAssumed;
      // Implied growth from P = FCF*(1+g)/(wacc-g) -> g = (P*wacc - FCF) / (P + FCF)
      const w = i.wacc / 100;
      const num = mcap * w - fcf;
      const den = mcap + fcf;
      const g = den ? (num / den) * 100 : NaN;
      const signal = g > i.growthCeiling ? "OVERVALUED" : g > i.growthCeiling - 3 ? "FAIRLY VALUED" : "UNDERVALUED";
      r.rdcf = { impliedG: g, signal };
    }
    {
      const i = inputs.comps;
      r.comps = { lo: i.p25 * i.ebitda, mid: i.median * i.ebitda, hi: i.p75 * i.ebitda };
    }
    {
      const i = inputs["3stmt"];
      const cogs = i.revenue * (i.cogsPct / 100);
      const opex = i.revenue * (i.opexPct / 100);
      const ebit = i.revenue - cogs - opex;
      const tax  = Math.max(0, ebit) * 0.21;
      const ni   = ebit - tax;
      const fcf  = ebit * (1 - 0.21) + i.depreciation - i.capex;
      r["3stmt"] = { ebit, ni, fcf };
    }
    {
      const i = inputs.lbo;
      const debt = i.entryEv * (i.debtPct / 100);
      const equity = i.entryEv - debt;
      // Project EBITDA, accumulate FCF for debt paydown
      let ebitda = i.ebitda;
      let debtBal = debt;
      for (let y = 0; y < i.years; y++) {
        ebitda = ebitda * (1 + i.ebitdaGrowth / 100);
        const interest = debtBal * (i.interestRate / 100);
        const fcf = Math.max(0, (ebitda - interest) * 0.79); // 21% tax
        debtBal = Math.max(0, debtBal - fcf);
      }
      const exitEv = ebitda * i.exitMultiple;
      const exitEquity = Math.max(0, exitEv - debtBal);
      const moic = equity > 0 ? exitEquity / equity : 0;
      const irr  = equity > 0 && moic > 0 ? (Math.pow(moic, 1 / i.years) - 1) * 100 : NaN;
      r.lbo = { irr, moic, exitEv, exitEquity, debtBal };
    }
    {
      const i = inputs.risk;
      // 50/50 portfolio
      const wA = 0.5, wB = 0.5;
      const portRet = wA * i.retA + wB * i.retB;
      const variance = (wA ** 2) * (i.volA ** 2) + (wB ** 2) * (i.volB ** 2) + 2 * wA * wB * i.volA * i.volB * i.corr;
      const portVol = Math.sqrt(variance);
      const sharpe = (portRet - 4.5) / portVol;
      const naiveVol = wA * i.volA + wB * i.volB;
      const divBenefit = naiveVol > 0 ? ((naiveVol - portVol) / naiveVol) * 100 : 0;
      r.risk = { portRet, portVol, sharpe, divBenefit };
    }
    {
      const i = inputs.ma;
      const proFormaNi = i.acquirerEps * i.acquirerShares + i.targetNi + i.synergies;
      const newShares  = i.acquirerShares + i.sharesIssued;
      const newEps     = newShares > 0 ? proFormaNi / newShares : 0;
      const delta      = newEps - i.acquirerEps;
      const pct        = i.acquirerEps ? (delta / i.acquirerEps) * 100 : 0;
      r.ma = { newEps, delta, pct, accretive: delta > 0 };
    }
    return r;
  }, [inputs]);

  const runMonteCarlo = async () => {
    setMcRunning(true);
    setMcResult(null);
    setMcError(null);
    const i = inputs.mc;
    try {
      const { data, error } = await supabase.functions.invoke("monte-carlo", {
        body: { baseIrr: i.baseIrr, stdDev: i.stdDev, simulations: i.simulations },
      });
      if (error) throw error;
      if (!data || typeof data.p50 !== "number") throw new Error("Invalid simulation response");
      setMcResult({
        p10: data.p10, p50: data.p50, p90: data.p90,
        bins: data.bins, binEdges: data.binEdges, elapsedMs: data.elapsedMs,
      });
    } catch (e: any) {
      setMcError(e?.message || "Simulation failed");
    } finally {
      setMcRunning(false);
    }
  };

  // ---------- KPI strips per model ----------
  const kpis: { label: string; value: string; accent?: "green" | "amber" | "red" }[] = useMemo(() => {
    switch (active) {
      case "rdcf": {
        const c = calcs.rdcf;
        return [
          { label: "Price", value: fmtUsd(v.price) },
          { label: "Net Margin", value: fmtPct(v.netMargin, 1) },
          { label: "WACC", value: fmtPct(v.wacc, 1) },
          { label: "Term. Growth", value: fmtPct(v.terminalGrowth, 1) },
          { label: "Implied G", value: fmtPct(c.impliedG, 1), accent: c.signal === "OVERVALUED" ? "red" : c.signal === "UNDERVALUED" ? "green" : "amber" },
        ];
      }
      case "comps":
        return [
          { label: "EV/EBITDA P25", value: fmtX(v.p25, 1) },
          { label: "Median", value: fmtX(v.median, 1) },
          { label: "P75", value: fmtX(v.p75, 1) },
          { label: "Target EBITDA", value: fmtUsd(v.ebitda * 1e6) },
          { label: "Implied EV (Med)", value: fmtUsd(calcs.comps.mid * 1e6), accent: "amber" },
        ];
      case "3stmt":
        return [
          { label: "Revenue", value: fmtUsd(v.revenue * 1e6) },
          { label: "COGS %", value: fmtPct(v.cogsPct, 1) },
          { label: "OpEx %", value: fmtPct(v.opexPct, 1) },
          { label: "EBIT", value: fmtUsd(calcs["3stmt"].ebit * 1e6), accent: calcs["3stmt"].ebit > 0 ? "green" : "red" },
          { label: "FCF", value: fmtUsd(calcs["3stmt"].fcf * 1e6), accent: calcs["3stmt"].fcf > 0 ? "green" : "red" },
        ];
      case "lbo": {
        const c = calcs.lbo;
        return [
          { label: "Entry Multiple", value: fmtX(v.entryEv / v.ebitda, 1) },
          { label: "Exit Multiple", value: fmtX(v.exitMultiple, 1) },
          { label: "Debt/EBITDA", value: fmtX((v.entryEv * v.debtPct / 100) / v.ebitda, 1) },
          { label: "Target IRR", value: "20.0%" },
          { label: "Hold Period", value: `${v.years}y` },
        ];
      }
      case "risk": {
        const c = calcs.risk;
        return [
          { label: "Asset A Ret", value: fmtPct(v.retA, 1) },
          { label: "Asset B Ret", value: fmtPct(v.retB, 1) },
          { label: "Correlation", value: v.corr.toFixed(2) },
          { label: "Port Vol", value: fmtPct(c.portVol, 2), accent: "amber" },
          { label: "Sharpe", value: c.sharpe.toFixed(2), accent: c.sharpe > 1 ? "green" : c.sharpe > 0 ? "amber" : "red" },
        ];
      }
      case "ma": {
        const c = calcs.ma;
        return [
          { label: "Acquirer EPS", value: fmtUsd(v.acquirerEps) },
          { label: "Target NI", value: fmtUsd(v.targetNi * 1e6) },
          { label: "Shares Issued", value: fmtNum(v.sharesIssued, 1) + "M" },
          { label: "Synergies", value: fmtUsd(v.synergies * 1e6) },
          { label: "EPS Δ", value: fmtPct(c.pct, 2), accent: c.accretive ? "green" : "red" },
        ];
      }
      case "mc":
        return [
          { label: "Simulations", value: fmtNum(v.simulations, 0) },
          { label: "Mean IRR", value: fmtPct(v.baseIrr, 1) },
          { label: "P10 IRR", value: mcResult ? fmtPct(mcResult.p10, 1) : "—", accent: "red" },
          { label: "P90 IRR", value: mcResult ? fmtPct(mcResult.p90, 1) : "—", accent: "green" },
          { label: "Tail Risk %", value: mcResult ? fmtPct(mcResult.bins.slice(0, 2).reduce((a,b)=>a+b,0) / v.simulations * 100, 1) : "—", accent: "amber" },
        ];
    }
  }, [active, v, calcs, mcResult]);

  // ---------- model mechanics rows ----------
  const mechanics: Record<ModelKey, { c: string; d: string }[]> = {
    rdcf: [
      { c: "Reverse DCF", d: "Solves the discount equation for growth implied by current market price." },
      { c: "Formula", d: "g = (P·WACC − FCF) / (P + FCF)" },
      { c: "FCF Proxy", d: "Revenue × Net Margin (steady-state)" },
      { c: "Signal", d: "Compare implied g vs realistic ceiling — flag OVER/FAIR/UNDER." },
    ],
    comps: [
      { c: "Trading Comps", d: "Apply peer EV/EBITDA distribution to target EBITDA." },
      { c: "Bands", d: "P25 / Median / P75 multiples define implied EV range." },
      { c: "Use", d: "Triangulate value vs intrinsic methods." },
    ],
    "3stmt": [
      { c: "Income", d: "Revenue → COGS → OpEx → EBIT → Tax (21%) → Net Income." },
      { c: "Cash Flow", d: "FCF = EBIT·(1−t) + D&A − CapEx" },
      { c: "Use", d: "Operational profitability & cash conversion check." },
    ],
    lbo: [
      { c: "Capital Structure", d: "Entry EV split into Debt and Sponsor Equity." },
      { c: "Cash Sweep", d: "Annual FCF (after interest, taxed at 21%) pays down debt." },
      { c: "Exit", d: "Exit EV = Year-N EBITDA × Exit Multiple − Remaining Debt." },
      { c: "Returns", d: "MOIC = Exit Equity / Entry Equity ; IRR = MOIC^(1/N) − 1" },
    ],
    risk: [
      { c: "Portfolio Vol", d: "σ² = w₁²σ₁² + w₂²σ₂² + 2w₁w₂σ₁σ₂ρ (50/50 weights)" },
      { c: "Sharpe", d: "(Rp − Rf) / σp ; Rf = 4.50%" },
      { c: "Diversification", d: "Naive vol minus portfolio vol, as % of naive." },
    ],
    ma: [
      { c: "Pro-Forma NI", d: "Acquirer NI + Target NI + Synergies" },
      { c: "Pro-Forma EPS", d: "Pro-Forma NI / (Existing + Issued Shares)" },
      { c: "Signal", d: "ACCRETIVE if ΔEPS > 0, else DILUTIVE." },
    ],
    mc: [
      { c: "Distribution", d: "Normal(baseIRR, stdDev) via Box-Muller transform." },
      { c: "Sampling", d: "Up to 10,000 trials, chunked to keep UI responsive." },
      { c: "Output", d: "P10 / P50 / P90 + 20-bucket histogram." },
    ],
  };

  // ---------- input fields per model ----------
  const fields: Record<ModelKey, { k: string; label: string; step?: number }[]> = {
    rdcf: [
      { k: "price", label: "Current Price ($)", step: 1 },
      { k: "revenue", label: "Revenue TTM ($M)", step: 100 },
      { k: "netMargin", label: "Net Margin (%)", step: 0.5 },
      { k: "wacc", label: "WACC (%)", step: 0.25 },
      { k: "terminalGrowth", label: "Terminal Growth (%)", step: 0.25 },
      { k: "growthCeiling", label: "Realistic Ceiling (%)", step: 1 },
    ],
    comps: [
      { k: "p25", label: "EV/EBITDA P25", step: 0.5 },
      { k: "median", label: "EV/EBITDA Median", step: 0.5 },
      { k: "p75", label: "EV/EBITDA P75", step: 0.5 },
      { k: "ebitda", label: "Target EBITDA ($M)", step: 100 },
    ],
    "3stmt": [
      { k: "revenue", label: "Revenue ($M)", step: 100 },
      { k: "cogsPct", label: "COGS (%)", step: 1 },
      { k: "opexPct", label: "OpEx (%)", step: 1 },
      { k: "capex", label: "CapEx ($M)", step: 50 },
      { k: "depreciation", label: "Depreciation ($M)", step: 50 },
    ],
    lbo: [
      { k: "entryEv", label: "Entry EV ($M)", step: 50 },
      { k: "ebitda", label: "EBITDA ($M)", step: 10 },
      { k: "debtPct", label: "Debt (%)", step: 5 },
      { k: "interestRate", label: "Interest Rate (%)", step: 0.25 },
      { k: "ebitdaGrowth", label: "EBITDA Growth (%)", step: 0.5 },
      { k: "exitMultiple", label: "Exit Multiple", step: 0.5 },
      { k: "years", label: "Hold Years", step: 1 },
    ],
    risk: [
      { k: "retA", label: "Asset A Return (%)", step: 0.5 },
      { k: "volA", label: "Asset A Vol (%)", step: 0.5 },
      { k: "retB", label: "Asset B Return (%)", step: 0.5 },
      { k: "volB", label: "Asset B Vol (%)", step: 0.5 },
      { k: "corr", label: "Correlation (-1..1)", step: 0.05 },
    ],
    ma: [
      { k: "acquirerEps", label: "Acquirer EPS ($)", step: 0.1 },
      { k: "acquirerShares", label: "Acquirer Shares (M)", step: 1 },
      { k: "targetNi", label: "Target NI ($M)", step: 10 },
      { k: "sharesIssued", label: "Shares Issued (M)", step: 1 },
      { k: "synergies", label: "Synergies ($M)", step: 10 },
    ],
    mc: [
      { k: "baseIrr", label: "Base IRR (%)", step: 0.5 },
      { k: "stdDev", label: "Std Dev (%)", step: 0.5 },
      { k: "simulations", label: "Simulations (max 10,000)", step: 500 },
    ],
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <TerminalSidebar activeItem="financial-models" />
        <main className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-auto p-3">
            {/* Header */}
            <div className="mb-3 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <button onClick={() => navigate("/dashboard")} className="text-muted-foreground hover:text-primary transition-colors">
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <h1 className="font-serif text-sm font-bold text-primary uppercase tracking-wider">
                  Financial Models Deck
                </h1>
                <span className="text-[10px] text-muted-foreground font-data uppercase tracking-wider">via TCD Terminal · Institutional Framework</span>
              </div>
              <button onClick={reset} className="flex items-center gap-1 border border-border px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors">
                <RefreshCw className="h-3 w-3" /> Reset
              </button>
            </div>

            {/* Model selector */}
            <div className="mb-3 flex items-center gap-1 flex-wrap border border-border bg-card px-2 py-1.5">
              {MODELS.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setActive(m.key)}
                  className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border transition-colors ${
                    active === m.key
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* KPI strip */}
            <div className="mb-3 grid grid-cols-2 md:grid-cols-5 gap-0 border border-border bg-card">
              {kpis.map((k, i) => (
                <Kpi key={i} label={k.label} value={k.value} accent={k.accent} />
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {/* Mechanics */}
              <TerminalCard title={MODELS.find((m) => m.key === active)!.label}>
                <div className="font-data text-[11px]">
                  <div className="grid grid-cols-[140px_1fr] border-b border-border px-1 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <span>Concept</span><span>Definition</span>
                  </div>
                  {mechanics[active].map((row, i) => (
                    <div key={i} className="grid grid-cols-[140px_1fr] border-b border-border/30 px-1 py-1.5">
                      <span className="text-primary uppercase tracking-wider text-[10px]">{row.c}</span>
                      <span className="text-foreground">{row.d}</span>
                    </div>
                  ))}
                </div>
              </TerminalCard>

              {/* Inputs */}
              <TerminalCard title="Inputs">
                <div className="grid grid-cols-2 gap-2 p-1">
                  {fields[active].map((f) => (
                    <label key={f.k} className="flex flex-col gap-0.5">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{f.label}</span>
                      <input
                        type="number"
                        step={f.step ?? 1}
                        value={v[f.k]}
                        onChange={(e) => setV(f.k, parseFloat(e.target.value) || 0)}
                        className="bg-secondary/30 border border-border px-2 py-1 font-data text-[12px] text-foreground outline-none focus:border-primary"
                      />
                    </label>
                  ))}
                </div>
              </TerminalCard>

              {/* OUTPUT */}
              <TerminalCard title="Output / Signal" className="lg:col-span-2">
                {active === "rdcf" && <OutputBlock value={fmtPct(calcs.rdcf.impliedG, 2)} caption="Implied Growth Rate" rows={[
                  { k: "Realistic Ceiling", v: fmtPct(v.growthCeiling, 1) },
                  { k: "Signal", v: calcs.rdcf.signal, color: calcs.rdcf.signal === "OVERVALUED" ? "text-terminal-red" : calcs.rdcf.signal === "UNDERVALUED" ? "text-terminal-green" : "text-primary" },
                ]} />}

                {active === "comps" && (
                  <div className="grid grid-cols-3 gap-2 p-2">
                    <CompBox label="P25 EV" value={fmtUsd(calcs.comps.lo * 1e6)} />
                    <CompBox label="Median EV" value={fmtUsd(calcs.comps.mid * 1e6)} highlight />
                    <CompBox label="P75 EV" value={fmtUsd(calcs.comps.hi * 1e6)} />
                  </div>
                )}

                {active === "3stmt" && (
                  <div className="grid grid-cols-3 gap-2 p-2 font-data">
                    <ResultRow label="EBIT" value={fmtUsd(calcs["3stmt"].ebit * 1e6)} positive={calcs["3stmt"].ebit > 0} />
                    <ResultRow label="Net Income" value={fmtUsd(calcs["3stmt"].ni * 1e6)} positive={calcs["3stmt"].ni > 0} />
                    <ResultRow label="Free Cash Flow" value={fmtUsd(calcs["3stmt"].fcf * 1e6)} positive={calcs["3stmt"].fcf > 0} />
                  </div>
                )}

                {active === "lbo" && (
                  <div className="grid grid-cols-2 gap-3 p-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Sponsor IRR</div>
                      <div className={`font-data text-2xl font-bold ${calcs.lbo.irr > 20 ? "text-terminal-green" : calcs.lbo.irr > 0 ? "text-primary" : "text-terminal-red"}`}>
                        {fmtPct(calcs.lbo.irr, 1)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">MOIC</div>
                      <div className={`font-data text-2xl font-bold ${calcs.lbo.moic > 2.5 ? "text-terminal-green" : "text-primary"}`}>
                        {fmtX(calcs.lbo.moic, 2)}
                      </div>
                    </div>
                    <div className="col-span-2 grid grid-cols-3 gap-2 text-[11px] font-data border-t border-border pt-2">
                      <Row k="Exit EV" v={fmtUsd(calcs.lbo.exitEv * 1e6)} />
                      <Row k="Exit Equity" v={fmtUsd(calcs.lbo.exitEquity * 1e6)} />
                      <Row k="Debt Remaining" v={fmtUsd(calcs.lbo.debtBal * 1e6)} />
                    </div>
                  </div>
                )}

                {active === "risk" && (
                  <div className="grid grid-cols-3 gap-2 p-3">
                    <Stat label="Portfolio Vol" value={fmtPct(calcs.risk.portVol, 2)} />
                    <Stat label="Sharpe Ratio" value={calcs.risk.sharpe.toFixed(2)} accent={calcs.risk.sharpe > 1 ? "green" : calcs.risk.sharpe > 0 ? "amber" : "red"} />
                    <Stat label="Diversification Benefit" value={fmtPct(calcs.risk.divBenefit, 2)} accent="green" />
                  </div>
                )}

                {active === "ma" && (
                  <div className="grid grid-cols-2 gap-3 p-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Pro-Forma EPS</div>
                      <div className="font-data text-2xl font-bold text-primary">{fmtUsd(calcs.ma.newEps)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">EPS Δ</div>
                      <div className={`font-data text-2xl font-bold ${calcs.ma.accretive ? "text-terminal-green" : "text-terminal-red"}`}>
                        {calcs.ma.accretive ? "ACCRETIVE" : "DILUTIVE"} ({fmtPct(calcs.ma.pct, 2)})
                      </div>
                    </div>
                  </div>
                )}

                {active === "mc" && (
                  <div className="p-3">
                    <div className="flex items-center justify-between mb-3">
                      <button
                        onClick={runMonteCarlo}
                        disabled={mcRunning}
                        className="flex items-center gap-2 border border-primary bg-primary/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
                      >
                        {mcRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                        {mcRunning ? "Running…" : "Run Simulation"}
                      </button>
                      {mcResult && (
                        <div className="flex items-center gap-4 font-data text-[11px]">
                          <span><span className="text-muted-foreground uppercase tracking-wider text-[9px]">P10</span> <span className="text-terminal-red ml-1">{fmtPct(mcResult.p10, 1)}</span></span>
                          <span><span className="text-muted-foreground uppercase tracking-wider text-[9px]">P50</span> <span className="text-primary ml-1">{fmtPct(mcResult.p50, 1)}</span></span>
                          <span><span className="text-muted-foreground uppercase tracking-wider text-[9px]">P90</span> <span className="text-terminal-green ml-1">{fmtPct(mcResult.p90, 1)}</span></span>
                        </div>
                      )}
                    </div>
                    {mcResult && (
                      <div className="space-y-0.5">
                        {mcResult.bins.map((count, i) => {
                          const max = Math.max(...mcResult.bins);
                          const pct = (count / max) * 100;
                          const lo = mcResult.binEdges[i];
                          return (
                            <div key={i} className="grid grid-cols-[80px_1fr_60px] items-center gap-2 font-data text-[10px]">
                              <span className="text-muted-foreground text-right">{fmtPct(lo, 1)}</span>
                              <div className="h-3 bg-secondary/30 border border-border/50 relative">
                                <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-foreground">{count}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {mcError && (
                      <div className="py-3 text-center text-[11px] text-terminal-red font-data uppercase tracking-wider">
                        {mcError}
                      </div>
                    )}
                    {mcResult?.elapsedMs != null && (
                      <div className="mt-2 text-[9px] text-muted-foreground font-data uppercase tracking-wider text-right">
                        Server compute: {mcResult.elapsedMs}ms
                      </div>
                    )}
                    {!mcResult && !mcRunning && !mcError && (
                      <div className="py-8 text-center text-[11px] text-muted-foreground">Run a simulation to render the IRR distribution.</div>
                    )}
                  </div>
                )}
              </TerminalCard>
            </div>
          </div>
          <LiveTicker />
        </main>
      </div>
    </div>
  );
};

const Kpi = ({ label, value, accent }: { label: string; value: string; accent?: "green" | "amber" | "red" }) => (
  <div className="border-r border-border last:border-r-0 px-3 py-2">
    <div className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div>
    <div className={`mt-0.5 font-data text-sm font-bold ${
      accent === "red" ? "text-terminal-red" : accent === "amber" ? "text-primary" : accent === "green" ? "text-terminal-green" : "text-foreground"
    }`}>{value}</div>
  </div>
);

const Row = ({ k, v }: { k: string; v: string }) => (
  <div className="flex justify-between gap-2">
    <span className="text-muted-foreground uppercase tracking-wider text-[10px]">{k}</span>
    <span className="text-foreground">{v}</span>
  </div>
);

const OutputBlock = ({ value, caption, rows }: { value: string; caption: string; rows: { k: string; v: string; color?: string }[] }) => (
  <div className="grid grid-cols-2 gap-3 p-3">
    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{caption}</div>
      <div className="font-data text-2xl font-bold text-primary">{value}</div>
    </div>
    <div className="space-y-1 font-data text-[11px]">
      {rows.map((r, i) => (
        <div key={i} className="flex justify-between gap-2">
          <span className="text-muted-foreground uppercase tracking-wider text-[10px]">{r.k}</span>
          <span className={r.color || "text-foreground"}>{r.v}</span>
        </div>
      ))}
    </div>
  </div>
);

const CompBox = ({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) => (
  <div className={`border ${highlight ? "border-primary bg-primary/5" : "border-border"} p-3`}>
    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
    <div className={`font-data text-xl font-bold ${highlight ? "text-primary" : "text-foreground"}`}>{value}</div>
  </div>
);

const ResultRow = ({ label, value, positive }: { label: string; value: string; positive: boolean }) => (
  <div className="border border-border p-3">
    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
    <div className={`font-data text-xl font-bold ${positive ? "text-terminal-green" : "text-terminal-red"}`}>{value}</div>
  </div>
);

const Stat = ({ label, value, accent }: { label: string; value: string; accent?: "green" | "amber" | "red" }) => (
  <div className="border border-border p-3">
    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
    <div className={`font-data text-xl font-bold ${
      accent === "red" ? "text-terminal-red" : accent === "amber" ? "text-primary" : accent === "green" ? "text-terminal-green" : "text-foreground"
    }`}>{value}</div>
  </div>
);

export default FinancialModels;
