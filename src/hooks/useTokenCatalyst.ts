import { useCallback, useEffect, useState } from "react";

// DexScreener — free public API, no key, CORS-open.
// Docs: https://docs.dexscreener.com/api/reference

interface State<T> { data: T | null; loading: boolean; error: string | null; tierLocked: boolean; }
const empty = <T,>(): State<T> => ({ data: null, loading: false, error: null, tierLocked: false });
const unavail = <T,>(): State<T> => ({ data: null, loading: false, error: "Not available via DexScreener", tierLocked: false });

interface DexPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; name: string; symbol: string };
  priceUsd?: string;
  priceNative?: string;
  volume?: { h24?: number; h6?: number; h1?: number };
  priceChange?: { h24?: number; h6?: number; h1?: number };
  liquidity?: { usd?: number; base?: number; quote?: number };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  info?: { imageUrl?: string; socials?: { type: string; url: string }[] };
  txns?: { h24?: { buys?: number; sells?: number } };
}

interface DexResponse { pairs: DexPair[] | null; }

async function fetchTokenData(tokenMint: string): Promise<DexResponse> {
  const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`);
  if (!res.ok) throw new Error(`DexScreener ${res.status}`);
  return res.json();
}

export function useTokenCatalyst(address: string) {
  const [meta, setMeta] = useState<State<any>>(empty());
  const [markets, setMarkets] = useState<State<any>>(empty());
  const [holders] = useState<State<any>>(unavail());
  const [transfers] = useState<State<any>>(unavail());
  const [defi] = useState<State<any>>(unavail());
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    if (!address) return;
    setMeta({ data: null, loading: true, error: null, tierLocked: false });
    setMarkets({ data: null, loading: true, error: null, tierLocked: false });
    try {
      const json = await fetchTokenData(address);
      const pairs = (json.pairs || []).filter((p) => p.chainId === "solana" || !p.chainId || true);
      // Sort by liquidity desc to surface the primary pair first
      pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
      const primary = pairs[0];

      if (!primary) {
        setMeta({ data: null, loading: false, error: "No DEX pair found for this token", tierLocked: false });
        setMarkets({ data: [], loading: false, error: null, tierLocked: false });
        setLastUpdated(new Date());
        return;
      }

      // Aggregate volume + liquidity across pairs
      const volume_24h = pairs.reduce((s, p) => s + (p.volume?.h24 || 0), 0);
      const liquidity_usd = pairs.reduce((s, p) => s + (p.liquidity?.usd || 0), 0);

      const metaShaped = {
        symbol: primary.baseToken.symbol,
        name: primary.baseToken.name,
        address: primary.baseToken.address,
        decimals: 0, // DexScreener doesn't expose decimals
        supply: 0,
        price: primary.priceUsd ? Number(primary.priceUsd) : null,
        market_cap: primary.marketCap || primary.fdv || null,
        fdv: primary.fdv || null,
        volume_24h,
        price_change_24h: primary.priceChange?.h24 ?? null,
        liquidity_usd,
        holder: null, // unavailable
        first_mint_time: primary.pairCreatedAt ? Math.floor(primary.pairCreatedAt / 1000) : null,
        icon: primary.info?.imageUrl || null,
        socials: primary.info?.socials || [],
      };

      const marketsShaped = pairs.slice(0, 20).map((p) => ({
        pool_id: p.pairAddress,
        program_id_label: p.dexId,
        source: p.dexId,
        token_1_symbol: p.baseToken.symbol,
        token_2_symbol: p.quoteToken.symbol,
        volume_24h: p.volume?.h24 || 0,
        liquidity_usd: p.liquidity?.usd || 0,
        url: p.url,
      }));

      setMeta({ data: metaShaped, loading: false, error: null, tierLocked: false });
      setMarkets({ data: marketsShaped, loading: false, error: null, tierLocked: false });
      setLastUpdated(new Date());
    } catch (e: any) {
      const msg = e?.message || "DexScreener request failed";
      setMeta({ data: null, loading: false, error: msg, tierLocked: false });
      setMarkets({ data: null, loading: false, error: msg, tierLocked: false });
    }
  }, [address]);

  useEffect(() => { refresh(); }, [refresh]);

  // Wallet PnL not available on DexScreener
  const fetchWalletPnl = useCallback(async (_wallet: string) => {
    return Promise.resolve();
  }, []);

  return {
    meta, markets, holders, transfers, defi,
    holdersChange: unavail(), topHolders: unavail(), dexTrades: unavail(), walletPnl: unavail(),
    fetchWalletPnl, lastUpdated, refresh,
  };
}
