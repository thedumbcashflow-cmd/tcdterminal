// DeFiLlama & GeckoTerminal services routed through Supabase Edge Function proxy
// to avoid CORS issues and add server-side 60s caching.

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const PROXY_URL = `https://${PROJECT_ID}.functions.supabase.co/data-room-proxy`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

async function proxyFetch(source: "defi_llama" | "gecko_terminal", endpoint: string): Promise<any> {
  const url = `${PROXY_URL}?source=${source}&endpoint=${encodeURIComponent(endpoint)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${ANON_KEY}`, apikey: ANON_KEY },
  });
  if (!res.ok) {
    let detail = "";
    try { const j = await res.json(); detail = j.error || j.detail || ""; } catch { /* noop */ }
    throw new Error(detail || `Proxy returned ${res.status}`);
  }
  return res.json();
}

export function formatTvl(n: number): string {
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "b";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(1) + "m";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "k";
  return "$" + n.toFixed(0);
}

// ── TVL ──
export async function fetchSolanaTvlHistory(): Promise<Array<{ date: number; tvl: number }>> {
  const data = await proxyFetch("defi_llama", "/v2/historicalChainTvl/Solana");
  return (data as Array<{ date: number; tvl: number }>).slice(-90);
}

// ── Top Protocols ──
export interface SolanaProtocol {
  name: string; tvl: number; change_1d: number; category: string; logo: string;
}

export async function fetchTopSolanaProtocols(): Promise<SolanaProtocol[]> {
  const data: any[] = await proxyFetch("defi_llama", "/protocols");
  return data
    .filter(p => Array.isArray(p.chains) && p.chains.includes("Solana") && p.tvl > 0)
    .sort((a, b) => b.tvl - a.tvl)
    .slice(0, 10)
    .map(p => ({
      name: p.name, tvl: p.tvl, change_1d: p.change_1d ?? 0,
      category: p.category ?? "—", logo: p.logo ?? "",
    }));
}

// ── DEX Volumes (DeFiLlama overview) ──
export interface DexVolume {
  name: string; dailyVolume: number; totalVolume: number; logo: string; change_1d: number | null;
}

export async function fetchSolanaDexVolumes(): Promise<{
  totalDailyVolume: number; protocols: DexVolume[];
}> {
  const data = await proxyFetch(
    "defi_llama",
    "/overview/dexs/Solana?excludeTotalDataChart=false&excludeTotalDataChartBreakdown=false&dataType=dailyVolume"
  );
  const protocols: DexVolume[] = (data.protocols ?? [])
    .filter((p: any) => p.dailyVolume > 0)
    .sort((a: any, b: any) => b.dailyVolume - a.dailyVolume)
    .slice(0, 8)
    .map((p: any) => ({
      name: p.name, dailyVolume: p.dailyVolume ?? 0, totalVolume: p.totalVolume ?? 0,
      logo: p.logo ?? "", change_1d: p.change_1d ?? null,
    }));
  return { totalDailyVolume: data.total24h ?? 0, protocols };
}

// ── GeckoTerminal Pools ──
export interface SolanaPool {
  name: string; address: string; price_usd: string; volume_h24: string;
  reserve_in_usd: string; dex: string; price_change_h24: string;
}

export async function fetchTopSolanaPools(): Promise<SolanaPool[]> {
  const data = await proxyFetch(
    "gecko_terminal",
    "/api/v2/networks/solana/pools?page=1&sort=h24_volume_usd_desc"
  );
  return (data.data ?? []).slice(0, 10).map((pool: any) => ({
    name: pool.attributes.name,
    address: pool.id.replace("solana_", ""),
    price_usd: pool.attributes.base_token_price_usd,
    volume_h24: pool.attributes.volume_usd?.h24 ?? "0",
    reserve_in_usd: pool.attributes.reserve_in_usd ?? "0",
    dex: pool.relationships?.dex?.data?.id ?? "—",
    price_change_h24: pool.attributes.price_change_percentage?.h24 ?? "0",
  }));
}

// ── Protocol Revenue ──
export interface ProtocolRevenue {
  name: string; logo: string; category: string; dailyRevenue: number;
  dailyFees: number; change_1d: number | null; total7dRevenue: number;
}

export async function fetchSolanaProtocolRevenue(): Promise<{
  totalDailyRevenue: number; protocols: ProtocolRevenue[];
}> {
  const [revData, feesData] = await Promise.all([
    proxyFetch("defi_llama", "/overview/fees/Solana?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true&dataType=dailyRevenue"),
    proxyFetch("defi_llama", "/overview/fees/Solana?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true&dataType=dailyFees").catch(() => null),
  ]);
  const feesByName = new Map<string, number>();
  for (const p of (feesData?.protocols ?? [])) {
    const v = Number(p.total24h ?? p.dailyFees ?? 0);
    if (v > 0) feesByName.set(p.name, v);
  }
  const protocols: ProtocolRevenue[] = (revData.protocols ?? [])
    .map((p: any) => ({
      name: p.name,
      logo: p.logo ?? "",
      category: p.category ?? "—",
      dailyRevenue: Number(p.total24h ?? p.dailyRevenue ?? 0),
      dailyFees: feesByName.get(p.name) ?? Number(p.total24h ?? 0),
      change_1d: p.change_1d ?? null,
      total7dRevenue: Number(p.total7d ?? p.revenue7d ?? 0),
    }))
    .filter((p: ProtocolRevenue) => p.dailyRevenue > 0)
    .sort((a: ProtocolRevenue, b: ProtocolRevenue) => b.dailyRevenue - a.dailyRevenue)
    .slice(0, 10);
  return { totalDailyRevenue: Number(revData.total24h ?? 0), protocols };
}
