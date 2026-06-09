// Solana token enrichment: mint authorities, top holders, recent transactions.
// Uses Helius RPC (server-side) so we bypass the browser 403 on public mainnet-beta
// and avoid leaking the Helius key client-side.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const ALLOWED_ORIGINS = [
  "https://tcdterminal.lovable.app",
  "https://id-preview--19dfb6f8-6d48-4348-b424-2070a2f80361.lovable.app",
  "https://19dfb6f8-6d48-4348-b424-2070a2f80361.lovableproject.com",
  "https://id-preview--19dfb6f8-6d48-4348-b424-2070a2f80361.lovableproject.com",
  "http://localhost:3000",
  "http://localhost:5173",
];
const baseCors = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
function corsFor(req: Request) {
  const origin = req.headers.get("Origin");
  if (!origin) return { headers: baseCors, allowed: true };
  if (ALLOWED_ORIGINS.includes(origin)) {
    return { headers: { ...baseCors, "Access-Control-Allow-Origin": origin }, allowed: true };
  }
  return { headers: baseCors, allowed: false };
}
let corsHeaders: Record<string, string> = baseCors;

const HELIUS_KEY = Deno.env.get("HELIUS_API_KEY") || "";
const RPC_URL = HELIUS_KEY
  ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`
  : "https://api.mainnet-beta.solana.com";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function rpc(method: string, params: unknown[]) {
  const r = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const j = await r.json();
  if (j.error) throw new Error(`${method}: ${j.error.message}`);
  return j.result;
}

// Simple in-memory cache (60s) to respect rate limits
const cache = new Map<string, { at: number; body: unknown }>();
const TTL_MS = 60_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  let body: { address?: string };
  try { body = await req.json(); } catch { return json(400, { error: "Invalid JSON" }); }
  const address = body.address?.trim();
  if (!address || address.length < 32) return json(400, { error: "Invalid token address" });

  const cached = cache.get(address);
  if (cached && Date.now() - cached.at < TTL_MS) {
    return json(200, { ...(cached.body as object), cached: true });
  }

  try {
    // Parallel: mint info + largest accounts + Helius enriched txns
    const [accountInfo, largest, txns] = await Promise.allSettled([
      rpc("getAccountInfo", [address, { encoding: "jsonParsed" }]),
      rpc("getTokenLargestAccounts", [address]),
      HELIUS_KEY
        ? fetch(`https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${HELIUS_KEY}&limit=25`)
            .then((r) => r.ok ? r.json() : Promise.reject(new Error(`helius ${r.status}`)))
        : Promise.reject(new Error("HELIUS_API_KEY not set")),
    ]);

    const parsed = accountInfo.status === "fulfilled"
      ? (accountInfo.value as any)?.value?.data?.parsed?.info ?? null
      : null;
    const supply = parsed?.supply ? Number(parsed.supply) : null;
    const decimals = parsed?.decimals ?? null;

    const holders = largest.status === "fulfilled"
      ? ((largest.value as any)?.value || []).map((h: any) => ({
          address: h.address,
          owner: h.address, // largestAccounts returns the token account, not owner; UI accepts either
          amount: h.amount,
          ui_amount: h.uiAmount,
          decimals: h.decimals,
        }))
      : [];

    // Helius enriched transactions → split into transfers vs DeFi-like (SWAP, etc.)
    const rawTxs = txns.status === "fulfilled" ? (txns.value as any[]) : [];
    const transfers: any[] = [];
    const defi: any[] = [];
    for (const tx of rawTxs) {
      const ts = tx.timestamp || 0;
      const sig = tx.signature;
      const type = (tx.type || "").toString();
      if (type === "SWAP" || type === "TOKEN_MINT" || type === "BURN" || /SWAP|STAKE|LIQUIDITY/i.test(type)) {
        defi.push({
          trans_id: sig,
          signature: sig,
          block_time: ts,
          activity_type: type,
          platform: tx.source || "—",
          from_address: tx.feePayer || "",
          value: tx.fee ? tx.fee / 1e9 : null,
          amount_usd: null,
        });
      }
      // tokenTransfers array exists for token movement
      for (const tt of (tx.tokenTransfers || [])) {
        if (tt.mint !== address) continue;
        transfers.push({
          trans_id: sig,
          signature: sig,
          block_time: ts,
          from_address: tt.fromUserAccount,
          to_address: tt.toUserAccount,
          amount: tt.tokenAmount,
          token_decimals: decimals ?? 0,
        });
      }
    }

    const payload = {
      mint: {
        address,
        supply,
        decimals,
        mintAuthority: parsed?.mintAuthority ?? null,
        freezeAuthority: parsed?.freezeAuthority ?? null,
      },
      holders,
      transfers: transfers.slice(0, 25),
      defi: defi.slice(0, 25),
      heliusEnabled: !!HELIUS_KEY,
      errors: {
        accountInfo: accountInfo.status === "rejected" ? String(accountInfo.reason) : null,
        largest: largest.status === "rejected" ? String(largest.reason) : null,
        txns: txns.status === "rejected" ? String(txns.reason) : null,
      },
    };

    cache.set(address, { at: Date.now(), body: payload });
    return json(200, payload);
  } catch (e) {
    console.error("solana-token-data error", e);
    return json(500, { error: String(e) });
  }
});
