import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Hybrid data source:
//  - DexScreener (free, no key)        → price, market cap, FDV, volume, liquidity, active pairs
//  - solana-token-data edge function   → mint authorities, top holders, transfers, DeFi (via Helius)

interface State<T> { data: T | null; loading: boolean; error: string | null; tierLocked: boolean; }
const empty = <T,>(): State<T> => ({ data: null, loading: false, error: null, tierLocked: false });
const unavail = <T,>(): State<T> => ({ data: null, loading: false, error: "Not available", tierLocked: false });

interface DexPair {
  chainId: string; dexId: string; url: string; pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; name: string; symbol: string };
  priceUsd?: string; volume?: { h24?: number };
  priceChange?: { h24?: number }; liquidity?: { usd?: number };
  fdv?: number; marketCap?: number; pairCreatedAt?: number;
  info?: { imageUrl?: string; socials?: { type: string; url: string }[] };
}

async function fetchDex(mint: string): Promise<DexPair[]> {
  const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
  if (!r.ok) throw new Error(`DexScreener ${r.status}`);
  const j = await r.json();
  return j.pairs || [];
}

async function fetchOnChain(address: string) {
  const { data, error } = await supabase.functions.invoke("solana-token-data", { body: { address } });
  if (error) throw new Error(error.message || "solana-token-data failed");
  return data as {
    mint: { supply: number | null; decimals: number | null; mintAuthority: string | null; freezeAuthority: string | null };
    holders: any[]; transfers: any[]; defi: any[]; heliusEnabled: boolean;
  };
}

export function useTokenCatalyst(address: string) {
  const [meta, setMeta] = useState<State<any>>(empty());
  const [markets, setMarkets] = useState<State<any>>(empty());
  const [holders, setHolders] = useState<State<any>>(empty());
  const [transfers, setTransfers] = useState<State<any>>(empty());
  const [defi, setDefi] = useState<State<any>>(empty());
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    if (!address) return;
    setMeta({ data: null, loading: true, error: null, tierLocked: false });
    setMarkets({ data: null, loading: true, error: null, tierLocked: false });
    setHolders({ data: null, loading: true, error: null, tierLocked: false });
    setTransfers({ data: null, loading: true, error: null, tierLocked: false });
    setDefi({ data: null, loading: true, error: null, tierLocked: false });

    const [dexRes, chainRes] = await Promise.allSettled([fetchDex(address), fetchOnChain(address)]);

    // ── DexScreener: price/markets ──
    let primary: DexPair | undefined;
    let pairs: DexPair[] = [];
    let dexMeta: any = {};
    if (dexRes.status === "fulfilled") {
      pairs = dexRes.value.slice().sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
      primary = pairs[0];
      if (primary) {
        const volume_24h = pairs.reduce((s, p) => s + (p.volume?.h24 || 0), 0);
        const liquidity_usd = pairs.reduce((s, p) => s + (p.liquidity?.usd || 0), 0);
        dexMeta = {
          symbol: primary.baseToken.symbol,
          name: primary.baseToken.name,
          price: primary.priceUsd ? Number(primary.priceUsd) : null,
          market_cap: primary.marketCap || primary.fdv || null,
          fdv: primary.fdv || null,
          volume_24h,
          price_change_24h: primary.priceChange?.h24 ?? null,
          liquidity_usd,
          first_mint_time: primary.pairCreatedAt ? Math.floor(primary.pairCreatedAt / 1000) : null,
          icon: primary.info?.imageUrl || null,
          socials: primary.info?.socials || [],
        };
      }
      setMarkets({
        data: pairs.slice(0, 20).map((p) => ({
          pool_id: p.pairAddress,
          program_id_label: p.dexId,
          token_1_symbol: p.baseToken.symbol,
          token_2_symbol: p.quoteToken.symbol,
          volume_24h: p.volume?.h24 || 0,
          liquidity_usd: p.liquidity?.usd || 0,
          url: p.url,
        })),
        loading: false, error: null, tierLocked: false,
      });
    } else {
      setMarkets({ data: [], loading: false, error: (dexRes.reason as Error)?.message || "DexScreener error", tierLocked: false });
    }

    // ── On-chain via edge function: mint auths + holders + transfers + defi ──
    if (chainRes.status === "fulfilled") {
      const c = chainRes.value;
      setMeta({
        data: {
          address,
          ...dexMeta,
          supply: c.mint.supply,
          decimals: c.mint.decimals ?? 0,
          holder: c.holders?.length ?? null,
          mint_authority: c.mint.mintAuthority,
          freeze_authority: c.mint.freezeAuthority,
        },
        loading: false, error: primary ? null : "No DEX pair found",
        tierLocked: false,
      });
      setHolders({ data: c.holders, loading: false, error: null, tierLocked: false });
      setTransfers({
        data: c.transfers,
        loading: false,
        error: c.heliusEnabled ? null : "Add HELIUS_API_KEY to enable",
        tierLocked: false,
      });
      setDefi({
        data: c.defi,
        loading: false,
        error: c.heliusEnabled ? null : "Add HELIUS_API_KEY to enable",
        tierLocked: false,
      });
    } else {
      const msg = (chainRes.reason as Error)?.message || "On-chain fetch failed";
      setMeta({ data: dexMeta && primary ? { address, ...dexMeta, decimals: 0 } : null, loading: false, error: primary ? null : msg, tierLocked: false });
      setHolders({ data: [], loading: false, error: msg, tierLocked: false });
      setTransfers({ data: [], loading: false, error: msg, tierLocked: false });
      setDefi({ data: [], loading: false, error: msg, tierLocked: false });
    }

    setLastUpdated(new Date());
  }, [address]);

  useEffect(() => { refresh(); }, [refresh]);

  const fetchWalletPnl = useCallback(async (_w: string) => Promise.resolve(), []);

  return {
    meta, markets, holders, transfers, defi,
    holdersChange: unavail(), topHolders: unavail(), dexTrades: unavail(), walletPnl: unavail(),
    fetchWalletPnl, lastUpdated, refresh,
  };
}
