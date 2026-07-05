import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw, Search, Lock, Loader2, ExternalLink, AlertCircle, ShieldCheck, ShieldAlert } from "lucide-react";
import TopBar from "@/components/TopBar";
import TerminalSidebar from "@/components/TerminalSidebar";
import TerminalCard from "@/components/TerminalCard";
import LiveTicker from "@/components/LiveTicker";
import { useTokenCatalyst } from "@/hooks/useTokenCatalyst";
import { format } from "date-fns";

// Curated catalyst targets — institutional Solana names
const PRESETS: { sym: string; name: string; address: string }[] = [
  { sym: "SOL",  name: "Wrapped SOL",  address: "So11111111111111111111111111111111111111112" },
  { sym: "JUP",  name: "Jupiter",      address: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN" },
  { sym: "JTO",  name: "Jito",         address: "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL" },
  { sym: "PYTH", name: "Pyth Network", address: "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3" },
  { sym: "RAY",  name: "Raydium",      address: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R" },
  { sym: "WIF",  name: "dogwifhat",    address: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm" },
  { sym: "BONK", name: "Bonk",         address: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" },
];

const fmtUsd = (n: number | null | undefined) => {
  if (n == null || isNaN(n)) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toPrecision(3)}`;
};
const fmtNum = (n: number | null | undefined, d = 0) => {
  if (n == null || isNaN(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: d });
};
const short = (s: string, n = 4) => s ? `${s.slice(0, n)}…${s.slice(-n)}` : "—";

// Solana mint = base58, typically 32-44 chars, no 0/O/I/l
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const isValidMint = (s: string) => BASE58_RE.test(s.trim());

const Locked = ({ label }: { label: string }) => (
  <div className="flex flex-col items-center justify-center py-6 text-center">
    <Lock className="h-4 w-4 text-muted-foreground mb-1.5" />
    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label} requires Pro tier</div>
  </div>
);

const ErrState = ({ msg }: { msg: string }) => (
  <div className="flex items-center gap-1.5 py-4 px-2 text-[11px] text-terminal-red">
    <AlertCircle className="h-3 w-3 shrink-0" /> <span className="truncate">{msg}</span>
  </div>
);

const Loading = () => (
  <div className="flex items-center justify-center py-6 text-muted-foreground text-[11px]">
    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Loading…
  </div>
);

const AuthBadge = ({ label, addr }: { label: string; addr: string | null | undefined }) => {
  const revoked = !addr;
  return (
    <span className={`inline-flex items-center gap-1 border px-1.5 py-0.5 text-[10px] font-data uppercase tracking-wider ${
      revoked
        ? "border-terminal-green/40 bg-terminal-green/10 text-terminal-green"
        : "border-terminal-red/40 bg-terminal-red/10 text-terminal-red"
    }`}>
      {revoked ? <ShieldCheck className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
      {label}: {revoked ? "Revoked" : short(addr, 4)}
    </span>
  );
};

const PAGE_STEP = 20;

const TokenCatalyst = () => {
  const navigate = useNavigate();
  const [selected, setSelected] = useState(PRESETS[0]);
  const [customAddr, setCustomAddr] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [holderLimit, setHolderLimit] = useState(PAGE_STEP);
  const [transferLimit, setTransferLimit] = useState(PAGE_STEP);
  const address = selected.address;

  const { meta, markets, holders, holdersDiag, transfers, defi, lastUpdated, refresh } = useTokenCatalyst(address);

  const m = meta.data || {};
  const metaCore = m.data || m;
  const marketRows: any[] = markets.data?.data || markets.data || [];
  const holderRows: any[] = holders.data?.data?.items || holders.data?.data || holders.data || [];
  const transferRows: any[] = transfers.data?.data || transfers.data || [];
  const defiRows: any[] = defi.data?.data || defi.data || [];

  const totalSupply = Number(metaCore?.supply || metaCore?.total_supply || 0);
  const decimals = Number(metaCore?.decimals || 0);

  const topHolderPct = useMemo(() => {
    if (!Array.isArray(holderRows) || holderRows.length === 0 || !totalSupply) return null;
    const top10 = holderRows.slice(0, 10).reduce((acc, h) => acc + Number(h.amount || h.ui_amount || 0), 0);
    const supply = totalSupply / Math.pow(10, decimals);
    const top10Ui = decimals && Number(holderRows[0]?.ui_amount) ? top10 : top10 / Math.pow(10, decimals);
    return supply ? (top10Ui / supply) * 100 : null;
  }, [holderRows, totalSupply, decimals]);

  const submitCustom = () => {
    const a = customAddr.trim();
    if (!a) { setInputError("Enter a mint address"); return; }
    if (!isValidMint(a)) {
      setInputError("Invalid base58 mint (32–44 chars)");
      return;
    }
    setInputError(null);
    setHolderLimit(PAGE_STEP);
    setTransferLimit(PAGE_STEP);
    setSelected({ sym: short(a), name: "Custom", address: a });
  };

  const choosePreset = (p: typeof PRESETS[number]) => {
    setHolderLimit(PAGE_STEP);
    setTransferLimit(PAGE_STEP);
    setSelected(p);
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <TerminalSidebar activeItem="token-catalyst" />
        <main className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-auto p-3">
            {/* Header */}
            <div className="mb-3 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <button onClick={() => navigate("/dashboard")} className="text-muted-foreground hover:text-primary transition-colors">
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <h1 className="font-serif text-sm font-bold text-primary uppercase tracking-wider">
                  Token Catalyst Deck — {selected.sym}
                </h1>
                <span className="text-[10px] text-muted-foreground font-data uppercase tracking-wider">DexScreener + Helius</span>
              </div>
              <div className="flex items-center gap-2">
                {lastUpdated && (
                  <span className="text-[10px] text-muted-foreground font-data">
                    Updated {format(lastUpdated, "HH:mm:ss")}
                  </span>
                )}
                <button onClick={refresh} className="flex items-center gap-1 border border-border px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors">
                  <RefreshCw className="h-3 w-3" /> Refresh
                </button>
              </div>
            </div>

            {/* Token selector */}
            <div className="mb-3 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
              <div className="flex items-center gap-1 flex-wrap border border-border bg-card px-2 py-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p.address}
                    onClick={() => choosePreset(p)}
                    className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border transition-colors ${
                      selected.address === p.address
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {p.sym}
                  </button>
                ))}
              </div>
              <div className="flex flex-col">
                <div className={`flex items-center gap-1 border bg-card px-2 ${inputError ? "border-terminal-red" : "border-border"}`}>
                  <Search className="h-3 w-3 text-muted-foreground" />
                  <input
                    value={customAddr}
                    onChange={(e) => { setCustomAddr(e.target.value); if (inputError) setInputError(null); }}
                    onKeyDown={(e) => e.key === "Enter" && submitCustom()}
                    placeholder="Paste any Solana mint address…"
                    aria-invalid={!!inputError}
                    className="bg-transparent px-1 py-1 text-xs text-foreground font-data outline-none w-72 max-w-full"
                  />
                  <button onClick={submitCustom} className="text-[10px] uppercase tracking-wider text-primary hover:underline px-1">Load</button>
                </div>
                {inputError && <span className="text-[10px] text-terminal-red font-data mt-0.5">{inputError}</span>}
              </div>
            </div>

            {/* KPI strip */}
            <div className="mb-3 grid grid-cols-2 md:grid-cols-5 gap-0 border border-border bg-card">
              <Kpi label="Price" value={fmtUsd(Number(metaCore?.price))} loading={meta.loading} />
              <Kpi label="Market Cap" value={fmtUsd(Number(metaCore?.market_cap))} loading={meta.loading} />
              <Kpi label="24h Vol" value={fmtUsd(Number(metaCore?.volume_24h))} loading={meta.loading} />
              <Kpi label="Holders" value={fmtNum(Number(metaCore?.holder))} loading={meta.loading} />
              <Kpi
                label="Top10 Conc."
                value={topHolderPct == null ? "—" : `${topHolderPct.toFixed(1)}%`}
                loading={holders.loading}
                accent={topHolderPct != null && topHolderPct > 50 ? "red" : topHolderPct != null && topHolderPct > 30 ? "amber" : "green"}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {/* Meta panel */}
              <TerminalCard title="Token Meta">
                {meta.loading ? <Loading /> : (
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 px-1 text-[11px] font-data">
                    {meta.error && <div className="col-span-2"><ErrState msg={meta.error} /></div>}
                    <Row k="Symbol" v={metaCore?.symbol} />
                    <Row k="Name" v={metaCore?.name} />
                    <Row k="Decimals" v={String(decimals)} />
                    <Row k="Supply" v={totalSupply ? fmtNum(totalSupply / Math.pow(10, decimals)) : "—"} />
                    <Row k="Created" v={metaCore?.first_mint_time ? format(new Date(metaCore.first_mint_time * 1000), "yyyy-MM-dd") : "—"} />
                    <div className="col-span-2 flex flex-wrap gap-1.5 pt-1">
                      <AuthBadge label="Mint" addr={metaCore?.mint_authority} />
                      <AuthBadge label="Freeze" addr={metaCore?.freeze_authority} />
                    </div>
                    <div className="col-span-2 mt-1 flex items-center gap-2">
                      <a href={`https://solscan.io/token/${address}`} target="_blank" rel="noreferrer" className="text-[10px] text-primary uppercase tracking-wider flex items-center gap-1 hover:underline">
                        Solscan <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                )}
              </TerminalCard>

              {/* Markets */}
              <TerminalCard title="Active Markets" headerRight={<span className="text-[10px] text-muted-foreground font-data">{marketRows.length} pairs</span>}>
                {markets.loading ? <Loading /> : markets.error && marketRows.length === 0 ? <ErrState msg={markets.error} /> : marketRows.length === 0 ? (
                  <div className="py-6 text-center text-[11px] text-muted-foreground">No markets reported.</div>
                ) : (
                  <div className="max-h-64 overflow-auto">
                    <div className="grid grid-cols-[1fr_1fr_1fr] border-b border-border px-1 py-1 text-[10px] uppercase tracking-wider text-muted-foreground sticky top-0 bg-card">
                      <span>DEX</span><span>Pair</span><span className="text-right">24h Volume</span>
                    </div>
                    {marketRows.slice(0, 12).map((mk: any, i: number) => (
                      <div key={mk.pool_id || i} className="grid grid-cols-[1fr_1fr_1fr] border-b border-border/30 px-1 py-1 text-[11px] font-data hover:bg-secondary/30">
                        <span className="text-foreground truncate">{mk.program_id_label || mk.source || mk.market_source || "—"}</span>
                        <span className="text-muted-foreground truncate">{mk.token_1_symbol || mk.base_symbol || "—"}/{mk.token_2_symbol || mk.quote_symbol || "—"}</span>
                        <span className="text-right text-primary">{fmtUsd(Number(mk.volume_24h || mk.total_volume_24h))}</span>
                      </div>
                    ))}
                  </div>
                )}
              </TerminalCard>

              {/* Top Holders */}
              <TerminalCard title="Top Holders" headerRight={<span className="text-[10px] text-muted-foreground font-data">{Math.min(holderLimit, holderRows.length)}/{holderRows.length}</span>}>
                {holders.tierLocked ? <Locked label="Top Holders" /> :
                 holders.loading ? <Loading /> : holders.error && holderRows.length === 0 ? <ErrState msg={holders.error} /> : holderRows.length === 0 ? (
                  <div className="py-4 px-3 text-[11px] text-muted-foreground space-y-1.5">
                    <div className="text-foreground font-data uppercase tracking-wider text-[10px]">No holder data returned</div>
                    {!holdersDiag?.heliusEnabled && <div>• Helius key not configured — DAS fallback unavailable.</div>}
                    {holdersDiag?.heliusEnabled && holdersDiag?.source === "none" && (
                      <div>• Both <code>getTokenLargestAccounts</code> and Helius DAS returned empty. Likely a brand-new mint (indexing delay) or the mint has no distributed supply yet.</div>
                    )}
                    {holdersDiag?.largestError && <div>• RPC error: {holdersDiag.largestError}</div>}
                    {!holdersDiag?.supplyAvailable && <div>• Mint account not found — verify the address is a valid SPL token.</div>}
                    <div className="pt-1">Try a liquid mint:
                      {PRESETS.slice(0, 4).map((p) => (
                        <button key={p.sym} onClick={() => setSelected(p)} className="ml-2 text-primary hover:underline uppercase tracking-wider text-[10px]">{p.sym}</button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="max-h-64 overflow-auto">
                      <div className="grid grid-cols-[40px_1fr_1fr_60px] border-b border-border px-1 py-1 text-[10px] uppercase tracking-wider text-muted-foreground sticky top-0 bg-card">
                        <span>#</span><span>Address</span><span className="text-right">Amount</span><span className="text-right">%</span>
                      </div>
                      {holderRows.slice(0, holderLimit).map((h: any, i: number) => {
                        const supplyUi = totalSupply / Math.pow(10, decimals);
                        const amtUi = Number(h.ui_amount ?? (Number(h.amount || 0) / Math.pow(10, decimals)));
                        const pct = supplyUi ? (amtUi / supplyUi) * 100 : 0;
                        return (
                          <div key={h.address || h.owner || i} className="grid grid-cols-[40px_1fr_1fr_60px] border-b border-border/30 px-1 py-1 text-[11px] font-data hover:bg-secondary/30">
                            <span className="text-muted-foreground">{i + 1}</span>
                            <a href={`https://solscan.io/account/${h.owner || h.address}`} target="_blank" rel="noreferrer" className="text-foreground hover:text-primary truncate">{short(h.owner || h.address, 5)}</a>
                            <span className="text-right text-foreground">{fmtNum(amtUi, 2)}</span>
                            <span className={`text-right ${pct > 5 ? "text-terminal-red" : "text-primary"}`}>{pct.toFixed(2)}%</span>
                          </div>
                        );
                      })}
                    </div>
                    {holderLimit < holderRows.length && (
                      <button onClick={() => setHolderLimit((n) => n + PAGE_STEP)} className="w-full border-t border-border py-1 text-[10px] uppercase tracking-wider text-primary hover:bg-secondary/30">
                        Load more ({holderRows.length - holderLimit} remaining)
                      </button>
                    )}
                  </>
                )}
              </TerminalCard>

              {/* Recent Transfers */}
              <TerminalCard title="Recent Transfers" headerRight={<span className="text-[10px] text-muted-foreground font-data">{Math.min(transferLimit, transferRows.length)}/{transferRows.length}</span>}>
                {transfers.tierLocked ? <Locked label="Transfer flow" /> :
                 transfers.loading ? <Loading /> : transfers.error && transferRows.length === 0 ? <ErrState msg={transfers.error} /> : transferRows.length === 0 ? (
                  <div className="py-6 text-center text-[11px] text-muted-foreground">No transfers.</div>
                ) : (
                  <>
                    <div className="max-h-64 overflow-auto">
                      <div className="grid grid-cols-[80px_1fr_1fr_1fr] border-b border-border px-1 py-1 text-[10px] uppercase tracking-wider text-muted-foreground sticky top-0 bg-card">
                        <span>Time</span><span>From</span><span>To</span><span className="text-right">Amount</span>
                      </div>
                      {transferRows.slice(0, transferLimit).map((t: any, i: number) => {
                        const ts = t.block_time ? new Date(t.block_time * 1000) : null;
                        const amt = Number(t.amount ?? 0);
                        return (
                          <div key={t.trans_id || t.signature || i} className="grid grid-cols-[80px_1fr_1fr_1fr] border-b border-border/30 px-1 py-1 text-[11px] font-data hover:bg-secondary/30">
                            <span className="text-muted-foreground">{ts ? format(ts, "HH:mm:ss") : "—"}</span>
                            <span className="text-foreground truncate">{short(t.from_address || t.src, 4)}</span>
                            <span className="text-foreground truncate">{short(t.to_address || t.dst, 4)}</span>
                            <span className="text-right text-primary">{fmtNum(amt, 2)}</span>
                          </div>
                        );
                      })}
                    </div>
                    {transferLimit < transferRows.length && (
                      <button onClick={() => setTransferLimit((n) => n + PAGE_STEP)} className="w-full border-t border-border py-1 text-[10px] uppercase tracking-wider text-primary hover:bg-secondary/30">
                        Load more ({transferRows.length - transferLimit} remaining)
                      </button>
                    )}
                  </>
                )}
              </TerminalCard>

              {/* DeFi activities */}
              <TerminalCard title="DeFi Activity" className="lg:col-span-2" headerRight={<span className="text-[10px] text-muted-foreground font-data">{defiRows.length} actions</span>}>
                {defi.tierLocked ? <Locked label="DeFi activity" /> :
                 defi.loading ? <Loading /> : defi.error && defiRows.length === 0 ? <ErrState msg={defi.error} /> : defiRows.length === 0 ? (
                  <div className="py-6 text-center text-[11px] text-muted-foreground">No DeFi activity.</div>
                ) : (
                  <div className="max-h-72 overflow-auto">
                    <div className="grid grid-cols-[80px_90px_1fr_1fr_1fr_80px] border-b border-border px-1 py-1 text-[10px] uppercase tracking-wider text-muted-foreground sticky top-0 bg-card">
                      <span>Time</span><span>Type</span><span>Platform</span><span>Wallet</span><span className="text-right">Value</span><span className="text-right">Tx</span>
                    </div>
                    {defiRows.slice(0, 30).map((d: any, i: number) => {
                      const ts = d.block_time ? new Date(d.block_time * 1000) : null;
                      const type = (d.activity_type || d.activity || "").replace(/^ACTIVITY_/, "").toLowerCase();
                      const isBuy = /buy|add|deposit/.test(type);
                      const isSell = /sell|remove|withdraw/.test(type);
                      return (
                        <div key={d.trans_id || d.signature || i} className="grid grid-cols-[80px_90px_1fr_1fr_1fr_80px] border-b border-border/30 px-1 py-1 text-[11px] font-data hover:bg-secondary/30">
                          <span className="text-muted-foreground">{ts ? format(ts, "HH:mm:ss") : "—"}</span>
                          <span className={isBuy ? "text-terminal-green" : isSell ? "text-terminal-red" : "text-foreground"}>{type || "—"}</span>
                          <span className="text-foreground truncate">{d.platform?.[0] || d.platform || d.source || "—"}</span>
                          <span className="text-muted-foreground truncate">{short(d.from_address || d.owner || "", 4)}</span>
                          <span className="text-right text-primary">{fmtUsd(Number(d.value || d.amount_usd))}</span>
                          <a href={`https://solscan.io/tx/${d.trans_id || d.signature}`} target="_blank" rel="noreferrer" className="text-right text-primary hover:underline">view</a>
                        </div>
                      );
                    })}
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

const Row = ({ k, v }: { k: string; v: any }) => (
  <>
    <span className="text-muted-foreground uppercase tracking-wider text-[10px]">{k}</span>
    <span className="text-foreground truncate">{v ?? "—"}</span>
  </>
);

const Kpi = ({ label, value, loading, accent }: { label: string; value: string; loading?: boolean; accent?: "green" | "amber" | "red" }) => (
  <div className="border-r border-border last:border-r-0 px-3 py-2">
    <div className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div>
    <div className={`mt-0.5 font-data text-sm font-bold ${
      accent === "red" ? "text-terminal-red" : accent === "amber" ? "text-primary" : accent === "green" ? "text-terminal-green" : "text-foreground"
    }`}>
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : value}
    </div>
  </div>
);

export default TokenCatalyst;
