import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "get_protocol_revenue",
  title: "Get top protocol revenue (Solana)",
  description:
    "Return top Solana protocols ranked by 24h revenue and fees from DeFiLlama's public API. Useful for identifying which protocols are earning the most.",
  inputSchema: {
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .default(10)
      .describe("Number of protocols to return (1-50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async ({ limit }) => {
    try {
      const [revRes, feeRes] = await Promise.all([
        fetch("https://api.llama.fi/overview/fees?dataType=dailyRevenue"),
        fetch("https://api.llama.fi/overview/fees?dataType=dailyFees"),
      ]);
      if (!revRes.ok || !feeRes.ok) throw new Error(`llama ${revRes.status}/${feeRes.status}`);
      const rev = await revRes.json();
      const fees = await feeRes.json();
      const feeMap = new Map<string, number>();
      for (const p of fees.protocols ?? []) {
        if (p.chains?.includes("Solana")) feeMap.set(p.name, p.total24h ?? 0);
      }
      const rows = (rev.protocols ?? [])
        .filter((p: any) => p.chains?.includes("Solana"))
        .map((p: any) => ({
          name: p.name,
          category: p.category,
          dailyRevenue: p.total24h ?? 0,
          dailyFees: feeMap.get(p.name) ?? 0,
          change24h: p.change_1d ?? null,
        }))
        .sort((a: any, b: any) => b.dailyRevenue - a.dailyRevenue)
        .slice(0, limit);
      const total = rows.reduce((s: number, r: any) => s + r.dailyRevenue, 0);
      const payload = { totalDailyRevenueUsd: total, count: rows.length, protocols: rows };
      return {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
      };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Failed to fetch protocol revenue: ${String((e as Error).message ?? e)}` }],
        isError: true,
      };
    }
  },
});
