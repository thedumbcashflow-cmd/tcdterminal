import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

const RPC_ENDPOINTS = [
  "https://api.mainnet-beta.solana.com",
  "https://solana-rpc.publicnode.com",
];

async function rpc(method: string, params: unknown[] = []) {
  let lastErr: unknown;
  for (const url of RPC_ENDPOINTS) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      if (!r.ok) throw new Error(`${url} ${r.status}`);
      const j = await r.json();
      if (j.error) throw new Error(j.error.message ?? "rpc error");
      return j.result;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("all rpc endpoints failed");
}

export default defineTool({
  name: "get_solana_network_stats",
  title: "Get Solana network stats",
  description:
    "Return live Solana mainnet network stats: current epoch, slot, block height, and recent transactions-per-second sampled from a validator.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: true },
  handler: async () => {
    try {
      const [epoch, samples] = await Promise.all([
        rpc("getEpochInfo"),
        rpc("getRecentPerformanceSamples", [1]),
      ]);
      const sample = Array.isArray(samples) && samples[0] ? samples[0] : null;
      const tps = sample && sample.samplePeriodSecs
        ? Math.round(sample.numTransactions / sample.samplePeriodSecs)
        : null;
      const payload = {
        epoch: epoch?.epoch ?? null,
        slot: epoch?.absoluteSlot ?? null,
        blockHeight: epoch?.blockHeight ?? null,
        slotsInEpoch: epoch?.slotsInEpoch ?? null,
        slotIndex: epoch?.slotIndex ?? null,
        epochProgressPct:
          epoch?.slotsInEpoch && epoch?.slotIndex != null
            ? Number(((epoch.slotIndex / epoch.slotsInEpoch) * 100).toFixed(2))
            : null,
        tps,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
      };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Failed to fetch Solana network stats: ${String((e as Error).message ?? e)}` }],
        isError: true,
      };
    }
  },
});
