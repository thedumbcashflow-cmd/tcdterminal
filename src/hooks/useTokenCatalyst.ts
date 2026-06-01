import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type SolscanEndpoint =
  | "meta" | "markets" | "price" | "holders" | "transfers" | "defi" | "trending"
  | "holders-change" | "top-holders" | "dex-trades" | "wallet-pnl";

interface State<T> { data: T | null; loading: boolean; error: string | null; tierLocked: boolean; }
const empty = <T,>(): State<T> => ({ data: null, loading: false, error: null, tierLocked: false });

async function call<T>(endpoint: SolscanEndpoint, params: Record<string, string | number> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("solscan-proxy", {
    body: { endpoint, params },
  });
  if (error) {
    // Edge runtime returns FunctionsHttpError; surface code if available
    const ctx: any = (error as any).context;
    if (ctx?.status === 403) throw new Error("TIER_REQUIRED");
    throw new Error(error.message || "Solscan request failed");
  }
  return (data?.data as T);
}

export function useTokenCatalyst(address: string) {
  const [meta, setMeta] = useState<State<any>>(empty());
  const [markets, setMarkets] = useState<State<any>>(empty());
  const [holders, setHolders] = useState<State<any>>(empty());
  const [transfers, setTransfers] = useState<State<any>>(empty());
  const [defi, setDefi] = useState<State<any>>(empty());
  const [holdersChange, setHoldersChange] = useState<State<any>>(empty());
  const [topHolders, setTopHolders] = useState<State<any>>(empty());
  const [dexTrades, setDexTrades] = useState<State<any>>(empty());
  const [walletPnl, setWalletPnl] = useState<State<any>>(empty());
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const run = useCallback(async <T,>(
    endpoint: SolscanEndpoint,
    params: Record<string, string | number>,
    setter: (s: State<T>) => void,
  ) => {
    setter({ data: null, loading: true, error: null, tierLocked: false });
    try {
      const data = await call<T>(endpoint, params);
      setter({ data, loading: false, error: null, tierLocked: false });
    } catch (e: any) {
      const tierLocked = e?.message === "TIER_REQUIRED";
      setter({ data: null, loading: false, error: tierLocked ? "Premium tier required" : (e?.message || "Error"), tierLocked });
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!address) return;
    await Promise.allSettled([
      run("meta", { address }, setMeta),
      run("markets", { address, page: 1, page_size: 10 }, setMarkets),
      run("holders", { address, page: 1, page_size: 20 }, setHolders),
      run("transfers", { address, page: 1, page_size: 25, sort_by: "block_time", sort_order: "desc" }, setTransfers),
      run("defi", { address, page: 1, page_size: 20 }, setDefi),
      run("holders-change", { address, time: "24h" }, setHoldersChange),
      run("top-holders", { address, page: 1, page_size: 20 }, setTopHolders),
      run("dex-trades", { address, page: 1, page_size: 25, sort_by: "block_time", sort_order: "desc" }, setDexTrades),
    ]);
    setLastUpdated(new Date());
  }, [address, run]);

  // Wallet PnL is opt-in (different param shape) — exposed via fetchWalletPnl(wallet)
  const fetchWalletPnl = useCallback((wallet: string) => {
    return run("wallet-pnl", { address: wallet }, setWalletPnl);
  }, [run]);

  useEffect(() => { refresh(); }, [refresh]);

  return { meta, markets, holders, transfers, defi, holdersChange, topHolders, dexTrades, walletPnl, fetchWalletPnl, lastUpdated, refresh };
}
