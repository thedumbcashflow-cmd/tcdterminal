// Live Solana network stats. Solscan calls go through the solscan-proxy edge
// function (keeps SOLSCAN_API_KEY server-side); epoch/TPS/validators come from
// the public Solana mainnet RPC.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const RPC_URL   = "https://api.mainnet-beta.solana.com";
const SOL_MINT  = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export interface EpochInfo {
  epoch: number;
  slotIndex: number;
  slotsInEpoch: number;
  absoluteSlot: number;
  pct: number;
}

export interface SolanaStats {
  solPrice: number | null;
  solChange24h: number | null;
  usdcVol24h: number | null;
  usdcChange24h: number | null;
  tpsNonVote: number | null;
  epochInfo: EpochInfo | null;
  activeValidators: number | null;
  totalValidators: number | null;
  stakeRatePct: number | null;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
}

const INITIAL: SolanaStats = {
  solPrice: null, solChange24h: null,
  usdcVol24h: null, usdcChange24h: null,
  tpsNonVote: null,
  epochInfo: null,
  activeValidators: null, totalValidators: null, stakeRatePct: null,
  loading: true, error: null, lastUpdated: null,
};

async function rpc(method: string, params: any[] = []): Promise<any> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

async function solscanMeta(address: string): Promise<any> {
  const { data, error } = await supabase.functions.invoke("solscan-proxy", {
    body: { endpoint: "meta", params: { address } },
  });
  if (error) throw error;
  // Proxy wraps as { data: <upstream>, cached }
  const upstream = (data as any)?.data ?? data;
  return upstream?.data ?? upstream;
}

export function useSolanaStats(refreshMs = 30_000) {
  const [stats, setStats] = useState<SolanaStats>(INITIAL);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStats = useCallback(async () => {
    setStats((s) => ({ ...s, loading: true, error: null }));
    try {
      const [solRes, usdcRes, perfRes, epochRes, voteRes] = await Promise.allSettled([
        solscanMeta(SOL_MINT),
        solscanMeta(USDC_MINT),
        rpc("getRecentPerformanceSamples", [10]),
        rpc("getEpochInfo"),
        rpc("getVoteAccounts"),
      ]);

      const sol  = solRes.status === "fulfilled" ? solRes.value : null;
      const usdc = usdcRes.status === "fulfilled" ? usdcRes.value : null;

      // TPS (non-vote) — average over recent samples
      let tpsNonVote: number | null = null;
      if (perfRes.status === "fulfilled" && Array.isArray(perfRes.value)) {
        const valid = perfRes.value.filter(
          (s: any) => s.samplePeriodSecs > 0 && s.numTransactions > 0,
        );
        if (valid.length > 0) {
          const avgNonVote = valid.reduce((acc: number, s: any) => {
            const nv = s.numNonVoteTransactions ?? s.numTransactions * 0.35;
            return acc + nv;
          }, 0) / valid.length;
          const avgPeriod = valid.reduce((a: number, s: any) => a + s.samplePeriodSecs, 0) / valid.length;
          tpsNonVote = Math.round(avgNonVote / avgPeriod);
        }
      }

      let epochInfo: EpochInfo | null = null;
      if (epochRes.status === "fulfilled" && epochRes.value) {
        const e = epochRes.value;
        epochInfo = {
          epoch: e.epoch,
          slotIndex: e.slotIndex,
          slotsInEpoch: e.slotsInEpoch,
          absoluteSlot: e.absoluteSlot,
          pct: (e.slotIndex / e.slotsInEpoch) * 100,
        };
      }

      let activeValidators: number | null = null;
      let totalValidators: number | null = null;
      let stakeRatePct: number | null = null;
      if (voteRes.status === "fulfilled" && voteRes.value) {
        const va = voteRes.value;
        const current    = (va.current   ?? []) as any[];
        const delinquent = (va.delinquent ?? []) as any[];
        activeValidators = current.length;
        totalValidators  = current.length + delinquent.length;
        const activeStake = current.reduce((a, v) => a + Number(v.activatedStake ?? 0), 0);
        const totalStake  = activeStake + delinquent.reduce((a, v) => a + Number(v.activatedStake ?? 0), 0);
        stakeRatePct = totalStake > 0 ? (activeStake / totalStake) * 100 : null;
      }

      setStats({
        solPrice:      Number(sol?.price)             || null,
        solChange24h:  Number(sol?.price_change_24h)  || null,
        usdcVol24h:    Number(usdc?.volume_24h)       || null,
        usdcChange24h: Number(usdc?.price_change_24h) || null,
        tpsNonVote,
        epochInfo,
        activeValidators,
        totalValidators,
        stakeRatePct,
        loading: false,
        error: null,
        lastUpdated: new Date(),
      });
    } catch (e: any) {
      setStats((s) => ({
        ...s,
        loading: false,
        error: e?.message ?? "Fetch failed",
        lastUpdated: new Date(),
      }));
    }
  }, []);

  useEffect(() => {
    fetchStats();
    timerRef.current = setInterval(fetchStats, refreshMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchStats, refreshMs]);

  return { ...stats, refresh: fetchStats };
}
