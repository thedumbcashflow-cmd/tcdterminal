// DeFiLlama & GeckoTerminal API services — all free, no API key required

function formatTvl(n: number): string {
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "b";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(1) + "m";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "k";
  return "$" + n.toFixed(0);
}

export { formatTvl };

// ── TVL ──

export async function fetchSolanaTvlHistory(): Promise<Array<{ date: number; tvl: number }>> {
  const res = await fetch("https://api.llama.fi/v2/historicalChainTvl/Solana");
  if (!res.ok) throw new Error(`TVL fetch failed: ${res.status}`);
  const data = await res.json();
  return data.slice(-90);
}

// ── Top Protocols ──

export interface SolanaProtocol {
  name: string;
  tvl: number;
  change_1d: number;
  category: string;
  logo: string;
}

export async function fetchTopSolanaProtocols(): Promise<SolanaProtocol[]> {
  const res = await fetch("https://api.llama.fi/protocols");
  if (!res.ok) throw new Error(`Protocols fetch failed: ${res.status}`);
  const data: any[] = await res.json();
  return data
    .filter(p => Array.isArray(p.chains) && p.chains.includes("Solana") && p.tvl > 0)
    .sort((a, b) => b.tvl - a.tvl)
    .slice(0, 10)
    .map(p => ({
      name: p.name,
      tvl: p.tvl,
      change_1d: p.change_1d ?? 0,
      category: p.category ?? "—",
      logo: p.logo ?? "",
    }));
}

// ── DEX Volumes ──

export interface DexVolume {
  name: string;
  dailyVolume: number;
  totalVolume: number;
  logo: string;
  change_1d: number | null;
}

export async function fetchSolanaDexVolumes(): Promise<{
  totalDailyVolume: number;
  protocols: DexVolume[];
}> {
  const res = await fetch(
    "https://api.llama.fi/overview/dexs/Solana?excludeTotalDataChart=false&excludeTotalDataChartBreakdown=false&dataType=dailyVolume"
  );
  if (!res.ok) throw new Error(`DEX volumes fetch failed: ${res.status}`);
  const data = await res.json();
  const protocols: DexVolume[] = (data.protocols ?? [])
    .filter((p: any) => p.dailyVolume > 0)
    .sort((a: any, b: any) => b.dailyVolume - a.dailyVolume)
    .slice(0, 8)
    .map((p: any) => ({
      name: p.name,
      dailyVolume: p.dailyVolume ?? 0,
      totalVolume: p.totalVolume ?? 0,
      logo: p.logo ?? "",
      change_1d: p.change_1d ?? null,
    }));
  return { totalDailyVolume: data.total24h ?? 0, protocols };
}

// ── GeckoTerminal Pools ──

export interface SolanaPool {
  name: string;
  address: string;
  price_usd: string;
  volume_h24: string;
  reserve_in_usd: string;
  dex: string;
  price_change_h24: string;
}

export async function fetchTopSolanaPools(): Promise<SolanaPool[]> {
  const res = await fetch(
    "https://api.geckoterminal.com/api/v2/networks/solana/pools?page=1&sort=h24_volume_usd_desc",
    { headers: { Accept: "application/json;version=20230302" } }
  );
  if (!res.ok) throw new Error(`Pools fetch failed: ${res.status}`);
  const data = await res.json();
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
  name: string;
  logo: string;
  category: string;
  dailyRevenue: number;
  dailyFees: number;
  change_1d: number | null;
  total7dRevenue: number;
}

export async function fetchSolanaProtocolRevenue(): Promise<{
  totalDailyRevenue: number;
  protocols: ProtocolRevenue[];
}> {
  const res = await fetch(
    "https://api.llama.fi/overview/fees/Solana?excludeTotalDataChart=false&excludeTotalDataChartBreakdown=false&dataType=dailyRevenue"
  );
  if (!res.ok) throw new Error(`Revenue fetch failed: ${res.status}`);
  const data = await res.json();
  const protocols: ProtocolRevenue[] = (data.protocols ?? [])
    .filter((p: any) => (p.dailyRevenue ?? 0) > 0)
    .sort((a: any, b: any) => (b.dailyRevenue ?? 0) - (a.dailyRevenue ?? 0))
    .slice(0, 10)
    .map((p: any) => ({
      name: p.name,
      logo: p.logo ?? "",
      category: p.category ?? "—",
      dailyRevenue: p.dailyRevenue ?? 0,
      dailyFees: p.dailyFees ?? 0,
      change_1d: p.change_1d ?? null,
      total7dRevenue: p.revenue7d ?? 0,
    }));
  return { totalDailyRevenue: data.total24h ?? 0, protocols };
}
