import { useState, useEffect, useCallback } from "react";
import {
  fetchSolanaTvlHistory,
  fetchTopSolanaProtocols,
  fetchSolanaDexVolumes,
  fetchTopSolanaPools,
  fetchSolanaProtocolRevenue,
} from "@/services/defiLlama";
import type { SolanaProtocol, DexVolume, SolanaPool, ProtocolRevenue } from "@/services/defiLlama";

interface LoadingState {
  tvl: boolean;
  protocols: boolean;
  dex: boolean;
  pools: boolean;
  revenue: boolean;
}

interface ErrorState {
  tvl: string | null;
  protocols: string | null;
  dex: string | null;
  pools: string | null;
  revenue: string | null;
}

export function useDataRoom() {
  const [tvlHistory, setTvlHistory] = useState<Array<{ date: number; tvl: number }>>([]);
  const [topProtocols, setTopProtocols] = useState<SolanaProtocol[]>([]);
  const [dexVolumes, setDexVolumes] = useState<{ totalDailyVolume: number; protocols: DexVolume[] } | null>(null);
  const [topPools, setTopPools] = useState<SolanaPool[]>([]);
  const [revenueData, setRevenueData] = useState<{ totalDailyRevenue: number; protocols: ProtocolRevenue[] } | null>(null);
  const [loading, setLoading] = useState<LoadingState>({ tvl: true, protocols: true, dex: true, pools: true, revenue: true });
  const [errors, setErrors] = useState<ErrorState>({ tvl: null, protocols: null, dex: null, pools: null, revenue: null });
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading({ tvl: true, protocols: true, dex: true, pools: true, revenue: true });
    setErrors({ tvl: null, protocols: null, dex: null, pools: null, revenue: null });

    await Promise.allSettled([
      fetchSolanaTvlHistory()
        .then(d => { setTvlHistory(d); setLoading(p => ({ ...p, tvl: false })); })
        .catch(e => { setErrors(p => ({ ...p, tvl: e.message })); setLoading(p => ({ ...p, tvl: false })); }),
      fetchTopSolanaProtocols()
        .then(d => { setTopProtocols(d); setLoading(p => ({ ...p, protocols: false })); })
        .catch(e => { setErrors(p => ({ ...p, protocols: e.message })); setLoading(p => ({ ...p, protocols: false })); }),
      fetchSolanaDexVolumes()
        .then(d => { setDexVolumes(d); setLoading(p => ({ ...p, dex: false })); })
        .catch(e => { setErrors(p => ({ ...p, dex: e.message })); setLoading(p => ({ ...p, dex: false })); }),
      fetchTopSolanaPools()
        .then(d => { setTopPools(d); setLoading(p => ({ ...p, pools: false })); })
        .catch(e => { setErrors(p => ({ ...p, pools: e.message })); setLoading(p => ({ ...p, pools: false })); }),
      fetchSolanaProtocolRevenue()
        .then(d => { setRevenueData(d); setLoading(p => ({ ...p, revenue: false })); })
        .catch(e => { setErrors(p => ({ ...p, revenue: e.message })); setLoading(p => ({ ...p, revenue: false })); }),
    ]);

    setLastUpdated(new Date());
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  return { tvlHistory, topProtocols, dexVolumes, topPools, revenueData, loading, errors, lastUpdated, refresh: fetchAll };
}
