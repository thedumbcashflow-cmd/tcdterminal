import { useState, useEffect, useCallback, useRef } from "react";
import {
  fetchSolanaTvlHistory,
  fetchTopSolanaProtocols,
  fetchSolanaDexVolumes,
  fetchTopSolanaPools,
  fetchSolanaProtocolRevenue,
} from "@/services/defiLlama";
import type { SolanaProtocol, DexVolume, SolanaPool, ProtocolRevenue } from "@/services/defiLlama";

type PanelKey = "tvl" | "protocols" | "dex" | "pools" | "revenue";

interface LoadingState { tvl: boolean; protocols: boolean; dex: boolean; pools: boolean; revenue: boolean; }
interface ErrorState { tvl: string | null; protocols: string | null; dex: string | null; pools: string | null; revenue: string | null; }

const CACHE_TTL_MS = 60_000;

export function useDataRoom() {
  const [tvlHistory, setTvlHistory] = useState<Array<{ date: number; tvl: number }>>([]);
  const [topProtocols, setTopProtocols] = useState<SolanaProtocol[]>([]);
  const [dexVolumes, setDexVolumes] = useState<{ totalDailyVolume: number; protocols: DexVolume[] } | null>(null);
  const [topPools, setTopPools] = useState<SolanaPool[]>([]);
  const [revenueData, setRevenueData] = useState<{ totalDailyRevenue: number; protocols: ProtocolRevenue[] } | null>(null);
  const [loading, setLoading] = useState<LoadingState>({ tvl: true, protocols: true, dex: true, pools: true, revenue: true });
  const [errors, setErrors] = useState<ErrorState>({ tvl: null, protocols: null, dex: null, pools: null, revenue: null });
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Per-panel last-fetched timestamps for 60s client cache
  const lastFetchedRef = useRef<Record<PanelKey, number>>({ tvl: 0, protocols: 0, dex: 0, pools: 0, revenue: 0 });

  const runPanel = useCallback(async (key: PanelKey, force = false) => {
    if (!force && Date.now() - lastFetchedRef.current[key] < CACHE_TTL_MS) return;
    setLoading(p => ({ ...p, [key]: true }));
    setErrors(p => ({ ...p, [key]: null }));
    try {
      switch (key) {
        case "tvl": setTvlHistory(await fetchSolanaTvlHistory()); break;
        case "protocols": setTopProtocols(await fetchTopSolanaProtocols()); break;
        case "dex": setDexVolumes(await fetchSolanaDexVolumes()); break;
        case "pools": setTopPools(await fetchTopSolanaPools()); break;
        case "revenue": setRevenueData(await fetchSolanaProtocolRevenue()); break;
      }
      lastFetchedRef.current[key] = Date.now();
    } catch (e: any) {
      setErrors(p => ({ ...p, [key]: e?.message || "Network error" }));
    } finally {
      setLoading(p => ({ ...p, [key]: false }));
    }
  }, []);

  const fetchAll = useCallback(async (force = false) => {
    await Promise.allSettled([
      runPanel("tvl", force),
      runPanel("protocols", force),
      runPanel("dex", force),
      runPanel("pools", force),
      runPanel("revenue", force),
    ]);
    setLastUpdated(new Date());
  }, [runPanel]);

  const retryPanel = useCallback((key: PanelKey) => runPanel(key, true), [runPanel]);

  useEffect(() => {
    fetchAll(true);
    const interval = setInterval(() => fetchAll(true), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  return {
    tvlHistory, topProtocols, dexVolumes, topPools, revenueData,
    loading, errors, lastUpdated,
    refresh: () => fetchAll(true),
    retryPanel,
  };
}
